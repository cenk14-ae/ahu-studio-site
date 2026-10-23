-- 13) E-POSTA DOĞRULAMASI YALNIZ LİSANS BAŞVURUSUNDA (23.10.2026, Cenk: «demoda şart koşmayalım ama lisans
--     alırken doğrulama şartı koyalım»)
--     · Auth'ta «Confirm email» KAPALI (mailer_autoconfirm = true): kayıt olan hemen girer, 7 günlük demo açılır.
--       Bu yüzden auth.users.email_confirmed_at artık kanıt DEĞİLDİR (kayıtta kendiliğinden dolar).
--     · Kanıt lisanslar.eposta_dogrulandi: lisans başvurusunda kullanıcı e-postasına giden 6 haneli kodu girer.
--       Kod 15 dk geçerli, 5 yanlış denemede düşer; kod isteme dakikada 1, saatte 5. Kod özeti saklanır.
--     · Kod e-postası 'bildirim' fonksiyonunun 'kod' türüyle KULLANICININ KENDİ adresine gider.
alter table public.lisanslar add column if not exists eposta_dogrulandi timestamptz;

-- Bu değişiklikten ÖNCE e-postasını doğrulamış hesaplar doğrulanmış sayılır
update public.lisanslar l set eposta_dogrulandi = u.email_confirmed_at
from auth.users u
where u.id = l.user_id and u.email_confirmed_at is not null and l.eposta_dogrulandi is null;

create table if not exists public.eposta_kodlari (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  kod_ozet  text not null,
  son       timestamptz not null,
  deneme    int not null default 0,
  gonderim  timestamptz[] not null default '{}'
);
alter table public.eposta_kodlari enable row level security;   -- politika YOK: yalnız aşağıdaki fonksiyonlar
revoke all on public.eposta_kodlari from anon, authenticated;

create or replace function public.eposta_kod_ozeti(kod text, uid uuid)
returns text language sql immutable set search_path = public as $$
  select encode(extensions.digest(kod || ':' || uid::text, 'sha256'), 'hex');
$$;
revoke all on function public.eposta_kod_ozeti(text, uuid) from public, anon, authenticated;

-- Kod gönder: 'zaten' (doğrulanmış) | 'gonderildi'; sıklık aşılırsa hata
create or replace function public.eposta_kodu_gonder()
returns text language plpgsql security definer set search_path = public as $$
declare l public.lisanslar; g timestamptz[]; k text;
begin
  if auth.uid() is null then raise exception 'oturum gerekli'; end if;
  select * into l from public.lisanslar where user_id = auth.uid();
  if l.eposta_dogrulandi is not null then return 'zaten'; end if;
  select array(select x from unnest(coalesce(e.gonderim, '{}')) x where x > now() - interval '1 hour')
    into g from public.eposta_kodlari e where e.user_id = auth.uid();
  g := coalesce(g, '{}');
  if exists (select 1 from unnest(g) x where x > now() - interval '60 seconds') then
    raise exception 'Kod az önce gönderildi; bir dakika bekleyip tekrar iste.';
  end if;
  if coalesce(array_length(g, 1), 0) >= 5 then
    raise exception 'Çok fazla kod istendi; bir saat sonra tekrar dene.';
  end if;
  k := lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
  insert into public.eposta_kodlari (user_id, kod_ozet, son, deneme, gonderim)
  values (auth.uid(), public.eposta_kod_ozeti(k, auth.uid()), now() + interval '15 minutes', 0, g || now())
  on conflict (user_id) do update set kod_ozet = excluded.kod_ozet, son = excluded.son, deneme = 0, gonderim = excluded.gonderim;
  perform public.bildirim_gonder('kod', jsonb_build_object('eposta', l.eposta, 'ad', l.ad, 'kod', k));
  return 'gonderildi';
end $$;
revoke all on function public.eposta_kodu_gonder() from public, anon;
grant execute on function public.eposta_kodu_gonder() to authenticated;

-- Başvuru ekranının sorduğu durum
create or replace function public.basvuru_durumum()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'son',        (select max(olusturma) from public.lisans_basvurulari where user_id = auth.uid()),
    'dogrulandi', (select eposta_dogrulandi is not null from public.lisanslar where user_id = auth.uid()));
$$;
revoke all on function public.basvuru_durumum() from public, anon;
grant execute on function public.basvuru_durumum() to authenticated;

-- LİSANS BAŞVURUSU (12-bildirim.sql'deki 5 parametreli sürümün yerine): doğrulanmamış hesap kod ister.
-- Sonuç JSON: {tamam:true, zaman} | {hata:'...'} — yanlış kod HATA FIRLATMAZ, yoksa deneme sayacı geri alınırdı.
drop function if exists public.lisans_basvur(text, text, text, text, text);
create or replace function public.lisans_basvur(ad text, firma text, telefon text, surum text, mesaj text, kod text default null)
returns json language plpgsql security definer set search_path = public as $$
declare l public.lisanslar; e public.eposta_kodlari; z timestamptz;
begin
  if auth.uid() is null then raise exception 'oturum gerekli'; end if;
  select * into l from public.lisanslar where user_id = auth.uid();
  if l.eposta_dogrulandi is null then
    if nullif(trim(lisans_basvur.kod), '') is null then
      return json_build_object('hata', 'dogrulama', 'mesaj', 'Başvuru için önce e-posta adresini doğrula: «Kod gönder»e bas, gelen 6 haneli kodu yaz.');
    end if;
    select * into e from public.eposta_kodlari where user_id = auth.uid();
    if e.user_id is null or e.son < now() then
      return json_build_object('hata', 'kod', 'mesaj', 'Kodun süresi doldu; yeni kod iste.');
    end if;
    if e.deneme >= 5 then
      return json_build_object('hata', 'kod', 'mesaj', 'Çok fazla yanlış deneme; yeni kod iste.');
    end if;
    if e.kod_ozet <> public.eposta_kod_ozeti(trim(lisans_basvur.kod), auth.uid()) then
      update public.eposta_kodlari set deneme = deneme + 1 where user_id = auth.uid();
      return json_build_object('hata', 'kod', 'mesaj', 'Kod yanlış. Kalan deneme: ' || (4 - e.deneme));
    end if;
    update public.lisanslar set eposta_dogrulandi = now() where user_id = auth.uid();
    delete from public.eposta_kodlari where user_id = auth.uid();
  end if;
  if exists (select 1 from public.lisans_basvurulari b
             where b.user_id = auth.uid() and b.olusturma > now() - interval '10 minutes') then
    return json_build_object('hata', 'sik', 'mesaj', 'Başvurun az önce alındı; tekrar göndermek için biraz bekle.');
  end if;
  insert into public.lisans_basvurulari (user_id, eposta, ad, firma, telefon, surum, mesaj)
  values (auth.uid(), l.eposta,
          left(nullif(trim(lisans_basvur.ad), ''), 120),
          left(nullif(trim(lisans_basvur.firma), ''), 160),
          left(nullif(trim(lisans_basvur.telefon), ''), 40),
          case when lisans_basvur.surum in ('sade','tam') then lisans_basvur.surum end,
          left(nullif(trim(lisans_basvur.mesaj), ''), 2000))
  returning olusturma into z;
  return json_build_object('tamam', true, 'zaman', z);
end $$;
revoke all on function public.lisans_basvur(text, text, text, text, text, text) from public, anon;
grant execute on function public.lisans_basvur(text, text, text, text, text, text) to authenticated;

-- Bildirimlere doğrulama durumu (kayıt anında hep 'hayır'; başvuruda artık hep 'evet')
create or replace function public.yeni_kayit_bildir()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.yoneticiler where user_id = new.user_id) then
    perform public.bildirim_gonder('kayit', jsonb_build_object(
      'eposta', new.eposta, 'ad', new.ad, 'firma', new.firma, 'aktif', new.aktif, 'demo', new.demo,
      'surum', new.surum, 'bitis', new.bitis, 'olusturma', new.olusturma,
      'dogrulandi', new.eposta_dogrulandi is not null));
  end if;
  return new;
end $$;
