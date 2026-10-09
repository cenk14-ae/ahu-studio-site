-- ============================================================================
-- AHU Studio — 7. adım: SANTRAL KÜTÜPHANESİ + FİRMALAR (09.10.2026)
-- Cenk: «AHU Studio kullanıcıları kütüphane oluşturabilsin, klasör yapısında; aynı firmada
-- çalışanların ortak kütüphanesi olsun, ben hepsine erişebileyim. Normal çalışmaları
-- sunucuda DURMAYACAK — yalnız kütüphaneler sunucuda durur.»
--
-- Kütüphane kaydı = TEK SANTRAL (projedeki bir AHU nesnesinin tamamı, jsonb).
-- İki kapsam:  kisi  → sahip = kullanıcının id'si (yalnız kendisi + yönetici)
--              firma → sahip = firmalar.id   (o firmaya atanmış geçerli lisanslılar + yönetici)
-- Firma kütüphanesinde HER üye ekler / düzenler / adlandırır / taşır / siler.
-- Silme YUMUŞAKTIR (çöp kutusu, 30 gün, geri alınır); kalıcı silme yalnız yönetici + 30 gün sonra
-- kendiliğinden (kutuphane_temizle). Klasör kendi içine taşınamaz (döngü tetikleyicide durur).
-- Kapı: geçerli lisans + AHU izni + tek oturum (oturum_bende) — yönetici muaf.
-- 1–6'dan SONRA çalışır; birden çok kez çalıştırılabilir.
-- ============================================================================

-- 1) FİRMALAR ------------------------------------------------------------------
create table if not exists public.firmalar (
  id        uuid primary key default gen_random_uuid(),
  ad        text not null,
  olusturma timestamptz not null default now(),
  constraint firma_ad_uzunluk check (char_length(btrim(ad)) between 1 and 120)
);
create unique index if not exists firmalar_ad_tekil on public.firmalar (lower(btrim(ad)));

alter table public.lisanslar add column if not exists firma_id uuid references public.firmalar(id) on delete set null;
create index if not exists lisanslar_firma_id on public.lisanslar (firma_id);

-- Giriş yapanın firması (RLS'te alt sorgu yerine; lisanslar RLS'ine takılmasın)
create or replace function public.benim_firmam()
returns uuid language sql stable security definer set search_path = public as $$
  select l.firma_id from public.lisanslar l where l.user_id = auth.uid();
$$;

alter table public.firmalar enable row level security;
drop policy if exists firma_oku   on public.firmalar;
drop policy if exists firma_ekle  on public.firmalar;
drop policy if exists firma_degis on public.firmalar;
drop policy if exists firma_sil   on public.firmalar;
create policy firma_oku   on public.firmalar for select to authenticated using (public.yonetici_mi() or id = public.benim_firmam());
create policy firma_ekle  on public.firmalar for insert to authenticated with check (public.yonetici_mi());
create policy firma_degis on public.firmalar for update to authenticated using (public.yonetici_mi()) with check (public.yonetici_mi());
create policy firma_sil   on public.firmalar for delete to authenticated using (public.yonetici_mi());
revoke all on public.firmalar from anon, public;
grant select, insert, update, delete on public.firmalar to authenticated;

-- 2) ERİŞİM KAPISI ----------------------------------------------------------------
-- Parametre adları lisanslar sütunlarıyla ÇAKIŞMAZ (5. adımın dersi: 'ad' → sütun kazanıyordu)
create or replace function public.kutuphane_erisim(p_kapsam text, p_sahip uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    public.yonetici_mi()
    or ( public.oturum_bende() and exists (
           select 1 from public.lisanslar l
            where l.user_id = auth.uid()
              and public.lisans_gecerli_mi(l)
              and 'ahu' = any(l.programlar)
              and ( (p_kapsam = 'kisi'  and p_sahip = auth.uid())
                 or (p_kapsam = 'firma' and l.firma_id is not null and l.firma_id = p_sahip) ) ) ) );
$$;
revoke execute on function public.kutuphane_erisim(text, uuid) from public, anon;
grant  execute on function public.kutuphane_erisim(text, uuid) to authenticated;

-- Kişinin görünen adı (Ad Soyad, yoksa e-posta) — yalnız tetikleyiciler kullanır; dışarı AÇILMAZ
create or replace function public.kutuphane_kisi_adi(p_uid uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(btrim(l.ad), ''), l.eposta, 'Bilinmeyen')
    from (select 1) d left join public.lisanslar l on l.user_id = p_uid;
$$;
revoke execute on function public.kutuphane_kisi_adi(uuid) from public, anon, authenticated;

-- 3) TABLOLAR -------------------------------------------------------------------------
create table if not exists public.kutuphane_klasor (
  id           uuid primary key default gen_random_uuid(),
  kapsam       text not null check (kapsam in ('kisi','firma')),
  sahip        uuid not null,
  ust_id       uuid references public.kutuphane_klasor(id) on delete cascade,
  ad           text not null check (char_length(btrim(ad)) between 1 and 120),
  olusturan    uuid,
  olusturan_ad text,
  olusturma    timestamptz not null default now(),
  guncelleme   timestamptz not null default now(),
  silindi      timestamptz,
  silen        uuid,
  silen_ad     text,
  silme_kok    boolean not null default false
);
create index if not exists kutuphane_klasor_kapsam on public.kutuphane_klasor (kapsam, sahip);
create index if not exists kutuphane_klasor_ust    on public.kutuphane_klasor (ust_id);

create table if not exists public.kutuphane_kayit (
  id             uuid primary key default gen_random_uuid(),
  kapsam         text not null check (kapsam in ('kisi','firma')),
  sahip          uuid not null,
  klasor_id      uuid references public.kutuphane_klasor(id) on delete cascade,   -- boş = kök
  ad             text not null check (char_length(btrim(ad)) between 1 and 160),
  ozet           jsonb not null default '{}'::jsonb
                   check (jsonb_typeof(ozet) = 'object' and octet_length(ozet::text) <= 8192),
  veri           jsonb not null
                   check (jsonb_typeof(veri) = 'object' and octet_length(veri::text) <= 2097152),  -- 2 MB
  surum          integer,                -- kaydeden programın PROJECT_VERSION'ı
  olusturan      uuid,
  olusturan_ad   text,
  olusturma      timestamptz not null default now(),
  guncelleyen    uuid,
  guncelleyen_ad text,
  guncelleme     timestamptz not null default now(),
  silindi        timestamptz,
  silen          uuid,
  silen_ad       text,
  silme_kok      boolean not null default false
);
create index if not exists kutuphane_kayit_kapsam on public.kutuphane_kayit (kapsam, sahip);
create index if not exists kutuphane_kayit_klasor on public.kutuphane_kayit (klasor_id);

-- 4) TETİKLEYİCİ: kimlik damgası, kapsam tutarlılığı, değişmez alanlar, döngü ------------
create or replace function public.kutuphane_tetik()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ust uuid; u record; kim uuid := auth.uid();
begin
  -- sahip gerçekten var mı
  if tg_op = 'INSERT' then
    if new.kapsam = 'kisi'  and not exists (select 1 from public.lisanslar where user_id = new.sahip) then
      raise exception 'Kütüphane sahibi bulunamadı.'; end if;
    if new.kapsam = 'firma' and not exists (select 1 from public.firmalar where id = new.sahip) then
      raise exception 'Firma bulunamadı.'; end if;
    new.silindi := null; new.silen := null; new.silen_ad := null; new.silme_kok := false;
    new.olusturma := now(); new.guncelleme := now();
    if kim is not null then new.olusturan := kim; new.olusturan_ad := public.kutuphane_kisi_adi(kim); end if;
    if tg_table_name = 'kutuphane_kayit' then
      new.guncelleyen := new.olusturan; new.guncelleyen_ad := new.olusturan_ad;
    end if;
  else
    if new.kapsam is distinct from old.kapsam or new.sahip is distinct from old.sahip then
      raise exception 'Kayıt başka bir kütüphaneye taşınamaz (kopyalanabilir).'; end if;
    new.olusturan := old.olusturan; new.olusturan_ad := old.olusturan_ad; new.olusturma := old.olusturma;
    new.guncelleme := now();
    -- çöpe atma / geri alma damgası
    if new.silindi is not null and old.silindi is null then
      new.silen := kim; new.silen_ad := case when kim is null then null else public.kutuphane_kisi_adi(kim) end;
    elsif new.silindi is null then
      new.silen := null; new.silen_ad := null; new.silme_kok := false;
    end if;
    -- (plpgsql 'and' kısa devre yapmaz: klasörde new.veri yoktur → iç içe if)
    if tg_table_name = 'kutuphane_kayit' then
      if new.veri is distinct from old.veri or new.ad is distinct from old.ad then
        new.guncelleyen := kim; new.guncelleyen_ad := case when kim is null then null else public.kutuphane_kisi_adi(kim) end;
      else
        new.guncelleyen := old.guncelleyen; new.guncelleyen_ad := old.guncelleyen_ad;
      end if;
    end if;
  end if;

  -- üst klasör (yalnız eklerken ya da taşınırken denetlenir)
  if tg_table_name = 'kutuphane_klasor' then
    ust := new.ust_id;
    if tg_op = 'UPDATE' and new.ust_id is not distinct from old.ust_id then ust := null; end if;
  else
    ust := new.klasor_id;
    if tg_op = 'UPDATE' and new.klasor_id is not distinct from old.klasor_id then ust := null; end if;
  end if;
  if ust is not null then
    select kapsam, sahip, silindi into u from public.kutuphane_klasor where id = ust;
    if not found or u.kapsam <> new.kapsam or u.sahip <> new.sahip then
      raise exception 'Hedef klasör bu kütüphanede değil.'; end if;
    if u.silindi is not null and new.silindi is null then
      raise exception 'Hedef klasör çöp kutusunda.'; end if;
    if tg_table_name = 'kutuphane_klasor' and tg_op = 'UPDATE' then
      if exists (
        with recursive alt as (
          select k.id from public.kutuphane_klasor k where k.id = new.id
          union all
          select k.id from public.kutuphane_klasor k join alt on k.ust_id = alt.id )
        select 1 from alt where alt.id = ust) then
        raise exception 'Klasör kendi içine (ya da alt klasörüne) taşınamaz.';
      end if;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.kutuphane_tetik() from public, anon, authenticated;

drop trigger if exists kutuphane_klasor_tetik on public.kutuphane_klasor;
create trigger kutuphane_klasor_tetik before insert or update on public.kutuphane_klasor
  for each row execute function public.kutuphane_tetik();
drop trigger if exists kutuphane_kayit_tetik on public.kutuphane_kayit;
create trigger kutuphane_kayit_tetik before insert or update on public.kutuphane_kayit
  for each row execute function public.kutuphane_tetik();

-- Firma silinirse kütüphanesi de gider (kişisel kütüphane: kullanıcı silinince lisans satırıyla)
create or replace function public.firma_sil_tetik()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.kutuphane_kayit  where kapsam = 'firma' and sahip = old.id;
  delete from public.kutuphane_klasor where kapsam = 'firma' and sahip = old.id;
  return old;
end $$;
revoke execute on function public.firma_sil_tetik() from public, anon, authenticated;
drop trigger if exists firma_sil_kutuphane on public.firmalar;
create trigger firma_sil_kutuphane before delete on public.firmalar
  for each row execute function public.firma_sil_tetik();

create or replace function public.lisans_sil_tetik()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.kutuphane_kayit  where kapsam = 'kisi' and sahip = old.user_id;
  delete from public.kutuphane_klasor where kapsam = 'kisi' and sahip = old.user_id;
  return old;
end $$;
revoke execute on function public.lisans_sil_tetik() from public, anon, authenticated;
drop trigger if exists lisans_sil_kutuphane on public.lisanslar;
create trigger lisans_sil_kutuphane before delete on public.lisanslar
  for each row execute function public.lisans_sil_tetik();

-- 5) RLS ---------------------------------------------------------------------------------
alter table public.kutuphane_klasor enable row level security;
alter table public.kutuphane_kayit  enable row level security;
drop policy if exists klasor_oku   on public.kutuphane_klasor;
drop policy if exists klasor_ekle  on public.kutuphane_klasor;
drop policy if exists klasor_degis on public.kutuphane_klasor;
drop policy if exists klasor_sil   on public.kutuphane_klasor;
drop policy if exists kayit_oku    on public.kutuphane_kayit;
drop policy if exists kayit_ekle   on public.kutuphane_kayit;
drop policy if exists kayit_degis  on public.kutuphane_kayit;
drop policy if exists kayit_sil    on public.kutuphane_kayit;
create policy klasor_oku   on public.kutuphane_klasor for select to authenticated using (public.kutuphane_erisim(kapsam, sahip));
create policy klasor_ekle  on public.kutuphane_klasor for insert to authenticated with check (public.kutuphane_erisim(kapsam, sahip));
create policy klasor_degis on public.kutuphane_klasor for update to authenticated using (public.kutuphane_erisim(kapsam, sahip)) with check (public.kutuphane_erisim(kapsam, sahip));
create policy klasor_sil   on public.kutuphane_klasor for delete to authenticated using (public.yonetici_mi());
create policy kayit_oku    on public.kutuphane_kayit  for select to authenticated using (public.kutuphane_erisim(kapsam, sahip));
create policy kayit_ekle   on public.kutuphane_kayit  for insert to authenticated with check (public.kutuphane_erisim(kapsam, sahip));
create policy kayit_degis  on public.kutuphane_kayit  for update to authenticated using (public.kutuphane_erisim(kapsam, sahip)) with check (public.kutuphane_erisim(kapsam, sahip));
create policy kayit_sil    on public.kutuphane_kayit  for delete to authenticated using (public.yonetici_mi());
revoke all on public.kutuphane_klasor, public.kutuphane_kayit from anon, public;
grant select, insert, update, delete on public.kutuphane_klasor, public.kutuphane_kayit to authenticated;

-- 6) ÇÖP KUTUSU — RLS'li (security invoker): yalnız erişebildiğin satırlar değişir ----------
-- Klasör silinince ALT AĞACIN TAMAMI aynı damgayla çöpe gider; çöpte yalnız kök görünür (silme_kok).
create or replace function public.kutuphane_sil(p_tur text, p_id uuid)
returns integer language plpgsql security invoker set search_path = public as $$
declare z timestamptz := clock_timestamp(); ids uuid[]; n integer := 0; m integer;
begin
  if p_tur = 'kayit' then
    update public.kutuphane_kayit set silindi = z, silme_kok = true where id = p_id and silindi is null;
    get diagnostics n = row_count;
  elsif p_tur = 'klasor' then
    with recursive alt as (
      select k.id from public.kutuphane_klasor k where k.id = p_id and k.silindi is null
      union all
      select k.id from public.kutuphane_klasor k join alt on k.ust_id = alt.id where k.silindi is null )
    select array_agg(id) into ids from alt;
    if ids is null then raise exception 'Klasör bulunamadı.'; end if;
    update public.kutuphane_klasor set silindi = z, silme_kok = (id = p_id) where id = any(ids);
    get diagnostics n = row_count;
    update public.kutuphane_kayit set silindi = z, silme_kok = false where klasor_id = any(ids) and silindi is null;
    get diagnostics m = row_count; n := n + m;
  else
    raise exception 'Geçersiz tür.';
  end if;
  if n = 0 then raise exception 'Kayıt bulunamadı.'; end if;
  return n;
end $$;

create or replace function public.kutuphane_geri_al(p_tur text, p_id uuid)
returns integer language plpgsql security invoker set search_path = public as $$
declare r record; ids uuid[]; n integer := 0; m integer;
begin
  if p_tur = 'kayit' then
    select * into r from public.kutuphane_kayit where id = p_id and silindi is not null;
    if not found then raise exception 'Kayıt çöp kutusunda değil.'; end if;
    -- klasörü yoksa ya da hâlâ çöpteyse köke döner
    update public.kutuphane_kayit
       set silindi = null,
           klasor_id = case when exists (select 1 from public.kutuphane_klasor k where k.id = r.klasor_id and k.silindi is null)
                            then r.klasor_id else null end
     where id = p_id;
    get diagnostics n = row_count;
  elsif p_tur = 'klasor' then
    select * into r from public.kutuphane_klasor where id = p_id and silindi is not null;
    if not found then raise exception 'Klasör çöp kutusunda değil.'; end if;
    with recursive alt as (
      select k.id from public.kutuphane_klasor k where k.id = p_id
      union all
      select k.id from public.kutuphane_klasor k join alt on k.ust_id = alt.id where k.silindi = r.silindi )
    select array_agg(id) into ids from alt;
    -- önce kök (üstü yoksa/çöpteyse köke döner), sonra aynı damgayla silinen alt ağaç
    update public.kutuphane_klasor
       set silindi = null,
           ust_id = case when exists (select 1 from public.kutuphane_klasor k where k.id = r.ust_id and k.silindi is null)
                         then r.ust_id else null end
     where id = p_id;
    update public.kutuphane_klasor set silindi = null where id = any(ids) and id <> p_id and silindi = r.silindi;
    get diagnostics n = row_count; n := n + 1;
    update public.kutuphane_kayit set silindi = null where klasor_id = any(ids) and silindi = r.silindi;
    get diagnostics m = row_count; n := n + m;
  else
    raise exception 'Geçersiz tür.';
  end if;
  return n;
end $$;

-- 30 günü dolan çöp kalıcı silinir. Kütüphane her açıldığında çağrılır (zaman tabanlı; herkes
-- tetikleyebilir, yalnız 30 günü geçenleri siler).
create or replace function public.kutuphane_temizle()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer := 0; m integer;
begin
  delete from public.kutuphane_kayit  where silindi < now() - interval '30 days';
  get diagnostics n = row_count;
  delete from public.kutuphane_klasor where silindi < now() - interval '30 days';
  get diagnostics m = row_count;
  return n + m;
end $$;

revoke execute on function public.kutuphane_sil(text, uuid), public.kutuphane_geri_al(text, uuid),
                           public.kutuphane_temizle() from public, anon;
grant  execute on function public.kutuphane_sil(text, uuid), public.kutuphane_geri_al(text, uuid),
                           public.kutuphane_temizle() to authenticated;

-- 7) BAĞLAM: hangi kütüphaneleri görebiliyorum? --------------------------------------------
-- Kullanıcı: Kişisel + (varsa) firması. Yönetici: bütün kişisel kütüphaneler + bütün firmalar.
create or replace function public.kutuphane_baglam()
returns json language sql stable security definer set search_path = public as $$
  with ben as (
    select l.*, public.yonetici_mi() as yon,
           (public.yonetici_mi() or (public.oturum_bende() and public.lisans_gecerli_mi(l) and 'ahu' = any(l.programlar))) as acik
      from public.lisanslar l where l.user_id = auth.uid() )
  select json_build_object(
    'uid', auth.uid(),
    'yonetici', coalesce((select yon from ben), false),
    'erisim',   coalesce((select acik from ben), false),
    'ad',       (select coalesce(nullif(btrim(ad), ''), eposta) from ben),
    'firma',    (select json_build_object('id', f.id, 'ad', f.ad) from ben join public.firmalar f on f.id = ben.firma_id),
    'kutuphaneler', coalesce(case
      when (select yon from ben) then (
        select json_agg(x order by x.sira, x.ad) from (
          select 'kisi' as kapsam, l.user_id as sahip,
                 coalesce(nullif(btrim(l.ad), ''), l.eposta) as ad,
                 case when l.user_id = auth.uid() then 0 else 2 end as sira
            from public.lisanslar l
          union all
          select 'firma', f.id, f.ad, 1 from public.firmalar f ) x )
      when (select acik from ben) then (
        select json_agg(x order by x.sira) from (
          select 'kisi' as kapsam, auth.uid() as sahip, 'Kişisel' as ad, 0 as sira
          union all
          select 'firma', f.id, f.ad, 1 from ben join public.firmalar f on f.id = ben.firma_id ) x )
      end, '[]'::json) );
$$;
revoke execute on function public.kutuphane_baglam() from public, anon;
grant  execute on function public.kutuphane_baglam() to authenticated;
