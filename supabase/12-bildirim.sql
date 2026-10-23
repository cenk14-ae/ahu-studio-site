-- 12) BİLDİRİM E-POSTALARI + LİSANS BAŞVURUSU (23.10.2026, Cenk: «yeni başvuranlar olduğunda bana bildirim
--     maili gelsin; lisans almak isteyenler lisans için başvurabilsin ve başvuru maili de bana gelsin»)
--     · Yeni kayıt (lisanslar satırı doğunca) ve lisans başvurusu → pg_net ile 'bildirim' Edge Function'ı
--       çağrılır → Resend ile yöneticiye e-posta. Alıcı / gönderen / Resend anahtarı fonksiyonun gizli
--       ayarlarındadır (BILDIRIM_ALICI, BILDIRIM_GONDEREN, RESEND_API_KEY) — depoda adres YOK.
--     · Çağrı kimliği: vault'taki 'bildirim_sirri' = fonksiyondaki BILDIRIM_SIRRI (başlık x-bildirim-sirri).
--     · pg_net istek kuyruğa girer, işlem bittikten SONRA gider: kayıt / başvuru e-postayı beklemez,
--       e-posta hatası kaydı bozmaz. Sonuçlar net._http_response'ta (birkaç saat) görülür.
create extension if not exists pg_net;

-- 1) Bildirimi kuyruğa koyan tek nokta (dışarıdan çağrılamaz)
create or replace function public.bildirim_gonder(tur text, veri jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare s text;
begin
  select decrypted_secret into s from vault.decrypted_secrets where name = 'bildirim_sirri';
  if s is null then return; end if;
  perform net.http_post(
    url := 'https://eqekvkfbysjzueywfiya.supabase.co/functions/v1/bildirim',
    body := jsonb_build_object('tur', tur, 'veri', veri),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-bildirim-sirri', s),
    timeout_milliseconds := 10000);
exception when others then
  raise warning 'bildirim kuyruğa alınamadı: %', sqlerrm;
end $$;
revoke all on function public.bildirim_gonder(text, jsonb) from public, anon, authenticated;

-- 2) YENİ KAYIT → bildirim (yönetici hesabı hariç)
create or replace function public.yeni_kayit_bildir()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.yoneticiler where user_id = new.user_id) then
    perform public.bildirim_gonder('kayit', jsonb_build_object(
      'eposta', new.eposta, 'ad', new.ad, 'firma', new.firma, 'aktif', new.aktif, 'demo', new.demo,
      'surum', new.surum, 'bitis', new.bitis, 'olusturma', new.olusturma));
  end if;
  return new;
end $$;
revoke all on function public.yeni_kayit_bildir() from public, anon, authenticated;
drop trigger if exists yeni_kayit_bildir on public.lisanslar;
create trigger yeni_kayit_bildir after insert on public.lisanslar
  for each row execute function public.yeni_kayit_bildir();

-- 3) LİSANS BAŞVURULARI — kullanıcı yalnız lisans_basvur() ile yazar; okuyan yalnız yönetici
create table if not exists public.lisans_basvurulari (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users(id) on delete cascade,
  eposta     text,
  ad         text,
  firma      text,
  telefon    text,
  surum      text check (surum in ('sade','tam')),
  mesaj      text,
  olusturma  timestamptz not null default now()
);
alter table public.lisans_basvurulari enable row level security;
drop policy if exists basvuru_oku on public.lisans_basvurulari;
drop policy if exists basvuru_sil on public.lisans_basvurulari;
create policy basvuru_oku on public.lisans_basvurulari for select using (public.yonetici_mi());
create policy basvuru_sil on public.lisans_basvurulari for delete using (public.yonetici_mi());
revoke all on public.lisans_basvurulari from anon, authenticated;
grant select, delete on public.lisans_basvurulari to authenticated;

-- Başvuru: oturum şart, 10 dakikada en çok bir; alanlar kırpılır. E-posta hesabın kendisinden gelir.
create or replace function public.lisans_basvur(ad text, firma text, telefon text, surum text, mesaj text)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare l public.lisanslar; z timestamptz;
begin
  if auth.uid() is null then raise exception 'oturum gerekli'; end if;
  if exists (select 1 from public.lisans_basvurulari b
             where b.user_id = auth.uid() and b.olusturma > now() - interval '10 minutes') then
    raise exception 'Başvurun az önce alındı; tekrar göndermek için biraz bekle.';
  end if;
  select * into l from public.lisanslar where user_id = auth.uid();
  insert into public.lisans_basvurulari (user_id, eposta, ad, firma, telefon, surum, mesaj)
  values (auth.uid(), l.eposta,
          left(nullif(trim(lisans_basvur.ad), ''), 120),
          left(nullif(trim(lisans_basvur.firma), ''), 160),
          left(nullif(trim(lisans_basvur.telefon), ''), 40),
          case when lisans_basvur.surum in ('sade','tam') then lisans_basvur.surum end,
          left(nullif(trim(lisans_basvur.mesaj), ''), 2000))
  returning olusturma into z;
  return z;
end $$;
revoke all on function public.lisans_basvur(text, text, text, text, text) from public, anon;
grant execute on function public.lisans_basvur(text, text, text, text, text) to authenticated;

-- Son başvuru tarihi (ekranda «başvurun alındı» göstermek için) — yalnız kendi
create or replace function public.son_lisans_basvurum()
returns timestamptz language sql stable security definer set search_path = public as $$
  select max(olusturma) from public.lisans_basvurulari where user_id = auth.uid();
$$;
revoke all on function public.son_lisans_basvurum() from public, anon;
grant execute on function public.son_lisans_basvurum() to authenticated;

-- 4) BAŞVURU → bildirim (kullanıcının o anki lisans durumuyla)
create or replace function public.lisans_basvuru_bildir()
returns trigger language plpgsql security definer set search_path = public as $$
declare l public.lisanslar;
begin
  select * into l from public.lisanslar where user_id = new.user_id;
  perform public.bildirim_gonder('lisans', jsonb_build_object(
    'eposta', new.eposta, 'ad', new.ad, 'firma', new.firma, 'telefon', new.telefon, 'surum', new.surum,
    'mesaj', new.mesaj, 'olusturma', new.olusturma,
    'simdiki', jsonb_build_object('aktif', l.aktif, 'demo', l.demo, 'surum', l.surum, 'bitis', l.bitis,
                                  'kayit', l.olusturma, 'kayit_firma', l.firma)));
  return new;
end $$;
revoke all on function public.lisans_basvuru_bildir() from public, anon, authenticated;
drop trigger if exists lisans_basvuru_bildir on public.lisans_basvurulari;
create trigger lisans_basvuru_bildir after insert on public.lisans_basvurulari
  for each row execute function public.lisans_basvuru_bildir();
