-- ============================================================================
-- AHU Studio — lisans sistemi kurulumu
-- Supabase paneli → SQL Editor → bu dosyanın TAMAMINI yapıştır → Run.
-- Birden çok kez çalıştırılabilir (her şey "yoksa oluştur / yeniden tanımla").
-- ============================================================================

-- 1) LİSANSLAR — her kullanıcıya bir satır; kayıt olunca PASİF doğar
create table if not exists public.lisanslar (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  eposta      text,
  ad          text,
  firma       text,
  aktif       boolean not null default false,
  surum       text    not null default 'sade' check (surum in ('sade','tam')),
  bitis       date,                      -- boş = süresiz
  notlar      text,
  olusturma   timestamptz not null default now(),
  son_giris   timestamptz
);

-- 2) YÖNETİCİLER — yönetim sayfasını yalnız bunlar açar
create table if not exists public.yoneticiler (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- 3) Yardımcı fonksiyonlar (security definer: RLS'e takılmadan okur)
create or replace function public.yonetici_mi()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.yoneticiler where user_id = auth.uid());
$$;

-- Lisans geçerli mi: aktif ve süresi dolmamış
create or replace function public.lisans_gecerli_mi(l public.lisanslar)
returns boolean language sql stable as $$
  select l.aktif and (l.bitis is null or l.bitis >= current_date);
$$;

-- Giriş yapan kullanıcının lisans durumu (giriş sayfası bunu sorar)
create or replace function public.lisans_durumu()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'var',      l.user_id is not null,
    'aktif',    coalesce(l.aktif, false),
    'surum',    l.surum,
    'bitis',    l.bitis,
    'gecerli',  coalesce(public.lisans_gecerli_mi(l), false),
    'yonetici', public.yonetici_mi()
  )
  from (select 1) d
  left join public.lisanslar l on l.user_id = auth.uid();
$$;

-- Son giriş zamanını yazar (kullanıcı kendi satırını başka türlü değiştiremez)
create or replace function public.giris_kaydet()
returns void language sql volatile security definer set search_path = public as $$
  update public.lisanslar set son_giris = now() where user_id = auth.uid();
$$;

-- Depodaki hangi dosyayı indirebilir: sade lisans → sade dosya, tam lisans → ikisi de
create or replace function public.dosya_izni(dosya text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.yonetici_mi() or exists (
    select 1 from public.lisanslar l
    where l.user_id = auth.uid()
      and public.lisans_gecerli_mi(l)
      and ( dosya = 'index-sade.html'
         or (dosya = 'index.html' and l.surum = 'tam') )
  );
$$;

-- 4) Kayıt olan her kullanıcıya PASİF lisans satırı aç
create or replace function public.yeni_kullanici()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.lisanslar (user_id, eposta, ad, firma)
  values (new.id, new.email,
          new.raw_user_meta_data->>'ad',
          new.raw_user_meta_data->>'firma')
  on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists yeni_kullanici_lisans on auth.users;
create trigger yeni_kullanici_lisans
  after insert on auth.users
  for each row execute function public.yeni_kullanici();

-- Kurulumdan ÖNCE açılmış hesaplar için de satır aç
insert into public.lisanslar (user_id, eposta)
select id, email from auth.users
on conflict (user_id) do nothing;

-- 5) RLS — kullanıcı yalnız KENDİ satırını GÖRÜR, değiştiremez; yönetici her şeyi
alter table public.lisanslar  enable row level security;
alter table public.yoneticiler enable row level security;

drop policy if exists lisans_oku     on public.lisanslar;
drop policy if exists lisans_guncelle on public.lisanslar;
drop policy if exists lisans_sil     on public.lisanslar;
create policy lisans_oku      on public.lisanslar for select using (user_id = auth.uid() or public.yonetici_mi());
create policy lisans_guncelle on public.lisanslar for update using (public.yonetici_mi()) with check (public.yonetici_mi());
create policy lisans_sil      on public.lisanslar for delete using (public.yonetici_mi());
-- insert politikası YOK: satırı yalnız tetikleyici açar

drop policy if exists yonetici_oku on public.yoneticiler;
create policy yonetici_oku on public.yoneticiler for select using (public.yonetici_mi());
-- yönetici ekleme/çıkarma yalnız SQL Editor'den (aşağıdaki 7. adım)

-- 6) DEPOLAMA — programın durduğu ÖZEL kova (herkese açık DEĞİL)
insert into storage.buckets (id, name, public)
values ('uygulama', 'uygulama', false)
on conflict (id) do update set public = false;

drop policy if exists uygulama_indir   on storage.objects;
drop policy if exists uygulama_yukle   on storage.objects;
drop policy if exists uygulama_degis   on storage.objects;
drop policy if exists uygulama_sil     on storage.objects;
create policy uygulama_indir on storage.objects for select
  using (bucket_id = 'uygulama' and public.dosya_izni(name));
create policy uygulama_yukle on storage.objects for insert
  with check (bucket_id = 'uygulama' and public.yonetici_mi());
create policy uygulama_degis on storage.objects for update
  using (bucket_id = 'uygulama' and public.yonetici_mi());
create policy uygulama_sil on storage.objects for delete
  using (bucket_id = 'uygulama' and public.yonetici_mi());

-- 7) KENDİNİ YÖNETİCİ YAP — sitede önce bu e-postayla KAYIT OL, sonra yalnız bu
--    bloğu tekrar çalıştır. Kendi lisansın da tam + süresiz + aktif olur.
insert into public.yoneticiler (user_id)
select id from auth.users where email = 'altinaycenkaltinay@gmail.com'
on conflict do nothing;

update public.lisanslar set aktif = true, surum = 'tam', bitis = null
where user_id in (select user_id from public.yoneticiler);
