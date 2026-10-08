-- ============================================================================
-- AHU Studio — 3. adım: TEK OTURUM (08.10.2026)
-- Bir hesap aynı anda TEK cihazda açık olabilir. Son giren kazanır; önceki cihaz
-- kilitlenir. Kimlik Supabase erişim belirtecindeki session_id'dir (auth.jwt()) —
-- aynı tarayıcının sekmeleri aynı oturumu paylaşır, ayrı cihaz/tarayıcı ayrı oturumdur.
-- Kapı depo kuralında (dosya_izni) ve sunucuda (lisans_durumu.oturum_bende) — tarayıcıda değil.
-- YÖNETİCİ MUAFTIR (birden çok cihazdan çalışabilir).
-- ============================================================================

alter table public.lisanslar add column if not exists aktif_oturum  uuid;
alter table public.lisanslar add column if not exists oturum_zamani timestamptz;
alter table public.lisanslar add column if not exists oturum_cihaz  text;

-- Bu belirtecin oturumu mu aktif?
create or replace function public.oturum_bende()
returns boolean language sql stable security definer set search_path = public as $$
  select public.yonetici_mi() or exists (
    select 1 from public.lisanslar l
    where l.user_id = auth.uid()
      and l.aktif_oturum is not null
      and l.aktif_oturum::text = coalesce(auth.jwt()->>'session_id', ''));
$$;

-- Girişte çağrılır: bu oturumu aktif yapar (öteki cihazlar kilitlenir)
create or replace function public.oturum_baslat(cihaz text default null)
returns boolean language sql volatile security definer set search_path = public as $$
  update public.lisanslar
     set aktif_oturum  = nullif(auth.jwt()->>'session_id', '')::uuid,
         oturum_zamani = now(),
         oturum_cihaz  = left(cihaz, 200)
   where user_id = auth.uid();
  select public.oturum_bende();
$$;

-- Nabız: hâlâ aktif oturum muyum? (açıkken her dakika)
create or replace function public.oturum_nabiz()
returns boolean language sql volatile security definer set search_path = public as $$
  update public.lisanslar set oturum_zamani = now()
   where user_id = auth.uid()
     and aktif_oturum::text = coalesce(auth.jwt()->>'session_id', '');
  select public.oturum_bende();
$$;

revoke execute on function public.oturum_bende(), public.oturum_baslat(text), public.oturum_nabiz() from public, anon;
grant  execute on function public.oturum_bende(), public.oturum_baslat(text), public.oturum_nabiz() to authenticated;

-- Depo kuralı: + aktif oturum şartı
create or replace function public.dosya_izni(dosya text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.yonetici_mi() or (public.oturum_bende() and exists (
    select 1 from public.lisanslar l
    where l.user_id = auth.uid()
      and public.lisans_gecerli_mi(l)
      and (
        ( 'ahu' = any(l.programlar)
          and ( dosya = 'index-sade.html' or (dosya = 'index.html' and l.surum = 'tam') ) )
        or exists (
          select 1 from public.programlar p
          where p.id <> 'ahu' and p.id = any(l.programlar) and dosya = any(p.dosyalar) )
      )
  ));
$$;

-- Durum: + oturum_bende (sunucu çekirdeği bunu da şart koşar)
create or replace function public.lisans_durumu()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'var',          l.user_id is not null,
    'aktif',        coalesce(l.aktif, false),
    'surum',        l.surum,
    'bitis',        l.bitis,
    'gecerli',      coalesce(public.lisans_gecerli_mi(l), false),
    'yonetici',     public.yonetici_mi(),
    'programlar',   coalesce(l.programlar, '{}'),
    'ad',           l.ad,
    'oturum_bende', public.oturum_bende()
  )
  from (select 1) d
  left join public.lisanslar l on l.user_id = auth.uid();
$$;
