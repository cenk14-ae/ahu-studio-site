-- ============================================================================
-- AHU Studio — 2. adım: KULLANICI BAŞINA PROGRAM İZİNLERİ + antet adı (08.10.2026)
-- kurulum.sql'den SONRA çalışır; birden çok kez çalıştırılabilir.
-- ============================================================================

-- 1) Program kataloğu — hangi dosya hangi programa ait (depo kuralı buradan okur)
--    Arayüzdeki ad/simge config.js'tedir; kimlikler (id) iki yerde AYNI olmalı.
create table if not exists public.programlar (
  id       text primary key,
  ad       text not null,
  dosyalar text[] not null default '{}'
);
alter table public.programlar enable row level security;
drop policy if exists program_oku on public.programlar;
create policy program_oku on public.programlar for select using (auth.uid() is not null);
revoke all on public.programlar from anon;
grant select on public.programlar to authenticated;

insert into public.programlar (id, ad, dosyalar) values
  ('ahu',      'AHU Studio',                  '{index.html,index-sade.html}'),
  ('hesap',    'Hesap Merkezi',               '{araclar/hesap-merkezi.html}'),
  ('batarya',  'Batarya Onay Resmi Kontrolü', '{araclar/batarya.html}'),
  ('order',    'İş Emri & Malzeme Listesi',   '{araclar/order.html}'),
  ('cfd',      'CFD Analiz Raporu',           '{araclar/cfd-rapor.html}'),
  ('rtu',      'RTU Seçim Aracı',             '{araclar/rtu.html}'),
  ('nem',      'Buharlı Nemlendirici Seçimi', '{araclar/buharli-nemlendirici.html}'),
  ('sukacagi', 'Su Kaçağı Koruma Setleri',    '{araclar/su-kacagi.html}'),
  ('plan',     'Ev ve Araç Alım Planı',       '{araclar/ev-arac-plani.html}'),
  ('uvc',      'UV-C Lamba Seçimi',           '{araclar/uvc-lamba.html}'),
  ('otopark',  'Otopark Akış Simülatörü',     '{araclar/otopark-akis.html}')
on conflict (id) do update set ad = excluded.ad, dosyalar = excluded.dosyalar;

-- 2) Kullanıcının açabildiği programlar — yeni kayıt yalnız AHU Studio ile başlar
alter table public.lisanslar add column if not exists programlar text[] not null default '{ahu}';

-- 3) Depo kuralı: geçerli lisans + programa izin. AHU'da rol sürümü belirler
--    (Normal → yalnız sade dosya, Pro → ikisi). Yönetici her şeyi açar.
create or replace function public.dosya_izni(dosya text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.yonetici_mi() or exists (
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
  );
$$;

-- 4) Giriş sayfasının sorduğu durum: + izinli programlar + antet adı (Ad Soyad)
create or replace function public.lisans_durumu()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'var',        l.user_id is not null,
    'aktif',      coalesce(l.aktif, false),
    'surum',      l.surum,
    'bitis',      l.bitis,
    'gecerli',    coalesce(public.lisans_gecerli_mi(l), false),
    'yonetici',   public.yonetici_mi(),
    'programlar', coalesce(l.programlar, '{}'),
    'ad',         l.ad
  )
  from (select 1) d
  left join public.lisanslar l on l.user_id = auth.uid();
$$;

-- 5) Yöneticinin kendi Ad Soyad'ı boşsa doldur (antetin ÇİZEN hücresi)
update public.lisanslar set ad = 'Cenk Altınay'
where user_id in (select user_id from public.yoneticiler) and coalesce(ad, '') = '';
