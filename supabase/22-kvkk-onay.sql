-- 22) KVKK / KULLANIM KOŞULLARI ONAYI + KİMLİK BEYANI + SAKLAMA SÜRELERİ (24.11.2026)
--     Cenk: «kvkk taslağı tamam işte diğer sitelerde uygulanan ne ise öyle olsun … 13 yaş altına veli onayı çerez onayı …
--     başkasının bilgilerini girip kayıt olmasını da engellememiz lazım bir başkası sonra benim bilgilerim girilmiş diye
--     şikayet edemesin». Cenk kararı: yalnız 18 yaş ve üstü (veli onayı akışı yok).
--     Metinler: kvkk.html, kosullar.html, cerez.html. Sürüm = kosul_surumu() = index.js KOSUL_SURUM.
--
--   1) kayit_onaylari: kim, hangi koşul/aydınlatma sürümünü, ne zaman kabul etti; 18 yaş + «bilgiler bana ait» beyanı.
--   2) kayit_onay_denetle (auth.users BEFORE INSERT): sitedeki formdan (Confirm email açık → email_confirmed_at boş)
--      gelen kayıtta onay + beyan + ad soyad YOKSA kayıt reddedilir — formu atlayıp API'ye doğrudan giden de kayıt olamaz.
--      Panelden yöneticinin açtığı hesap (email_confirmed_at dolu doğar) denetlenmez.
--   3) kayit_onay_yaz (AFTER INSERT): onayı tabloya yazar.
--   4) kosul_durumum() / kosul_onayla(): eski hesaplar ve koşul sürümü değişince ilk girişte yeniden onay.
--   5) kvkk_temizlik() + pg_cron (her gün 03:17 UTC): kullanım kaydı 180 gün, lisans başvurusu 2 yıl,
--      e-postası 7 günde doğrulanmamış kayıt (başkasının adresiyle açılan kayıt kendiliğinden düşer).
--   Geri alma: dosyanın sonundaki yorum bloğu.

create or replace function public.kosul_surumu() returns text language sql immutable as $$ select '2026-11-24'::text $$;
grant execute on function public.kosul_surumu() to anon, authenticated;

create table if not exists public.kayit_onaylari (
  id               bigint generated always as identity primary key,
  user_id          uuid not null references auth.users(id) on delete cascade,
  tur              text not null check (tur in ('kayit', 'guncelleme')),
  kosullar_surum   text not null,
  aydinlatma_surum text not null,
  yas18            boolean not null,
  kimlik_beyan     boolean not null,
  zaman            timestamptz not null default now()
);
create index if not exists kayit_onaylari_kullanici on public.kayit_onaylari (user_id, zaman desc);
alter table public.kayit_onaylari enable row level security;
drop policy if exists kayit_onay_oku on public.kayit_onaylari;
create policy kayit_onay_oku on public.kayit_onaylari for select using (user_id = auth.uid() or public.yonetici_mi());
revoke insert, update, delete on public.kayit_onaylari from anon, authenticated;

create or replace function public.kayit_onay_denetle()
returns trigger language plpgsql security definer set search_path = public as $$
declare o jsonb := new.raw_user_meta_data->'onay';
begin
  if new.email_confirmed_at is not null then return new; end if;
  if o is null or (o->>'yas18') is distinct from 'true' or (o->>'kimlik_beyan') is distinct from 'true'
     or nullif(o->>'surum', '') is null
     or length(btrim(coalesce(new.raw_user_meta_data->>'ad', ''))) < 3 then
    raise exception 'KAYIT_ONAY_EKSIK';
  end if;
  return new;
end $$;
revoke execute on function public.kayit_onay_denetle() from public, anon, authenticated;
drop trigger if exists kayit_onay_denetle on auth.users;
create trigger kayit_onay_denetle before insert on auth.users for each row execute function public.kayit_onay_denetle();

create or replace function public.kayit_onay_yaz()
returns trigger language plpgsql security definer set search_path = public as $$
declare o jsonb := new.raw_user_meta_data->'onay';
begin
  if o is not null then
    insert into public.kayit_onaylari (user_id, tur, kosullar_surum, aydinlatma_surum, yas18, kimlik_beyan)
    values (new.id, 'kayit', left(o->>'surum', 20), left(coalesce(o->>'surum', ''), 20),
            (o->>'yas18') = 'true', (o->>'kimlik_beyan') = 'true');
  end if;
  return new;
exception when others then
  raise warning 'kayit_onay_yaz: %', sqlerrm;   -- onay kaydı yazılamazsa kayıt yine düşmesin (denetim BEFORE'da yapıldı)
  return new;
end $$;
revoke execute on function public.kayit_onay_yaz() from public, anon, authenticated;
drop trigger if exists kayit_onay_yaz on auth.users;
create trigger kayit_onay_yaz after insert on auth.users for each row execute function public.kayit_onay_yaz();

create or replace function public.kosul_durumum()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.kayit_onaylari
                  where user_id = auth.uid() and kosullar_surum = public.kosul_surumu() and yas18 and kimlik_beyan);
$$;
revoke execute on function public.kosul_durumum() from public, anon;
grant execute on function public.kosul_durumum() to authenticated;

create or replace function public.kosul_onayla(yas18 boolean, kimlik_beyan boolean)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'oturum gerekli'; end if;
  if not coalesce(kosul_onayla.yas18, false) or not coalesce(kosul_onayla.kimlik_beyan, false) then
    raise exception 'KAYIT_ONAY_EKSIK';
  end if;
  if public.kosul_durumum() then return; end if;
  insert into public.kayit_onaylari (user_id, tur, kosullar_surum, aydinlatma_surum, yas18, kimlik_beyan)
  values (auth.uid(), 'guncelleme', public.kosul_surumu(), public.kosul_surumu(), true, true);
end $$;
revoke execute on function public.kosul_onayla(boolean, boolean) from public, anon;
grant execute on function public.kosul_onayla(boolean, boolean) to authenticated;

create or replace function public.kvkk_temizlik()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare z integer; b integer; k integer;
begin
  delete from public.ziyaretler where baslangic < now() - interval '180 days';
  get diagnostics z = row_count;
  delete from public.lisans_basvurulari where olusturma < now() - interval '2 years';
  get diagnostics b = row_count;
  delete from auth.users where email_confirmed_at is null and created_at < now() - interval '7 days';
  get diagnostics k = row_count;
  return jsonb_build_object('ziyaret', z, 'basvuru', b, 'dogrulanmamis_kayit', k);
end $$;
revoke execute on function public.kvkk_temizlik() from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('kvkk-temizlik', '17 3 * * *', 'select public.kvkk_temizlik()');

-- GERİ ALMA (SQL Editor'da):
--   select cron.unschedule('kvkk-temizlik');
--   drop trigger if exists kayit_onay_denetle on auth.users; drop trigger if exists kayit_onay_yaz on auth.users;
--   drop function if exists public.kayit_onay_denetle(), public.kayit_onay_yaz(), public.kosul_durumum(),
--     public.kosul_onayla(boolean, boolean), public.kvkk_temizlik(), public.kosul_surumu();
--   drop table if exists public.kayit_onaylari;
