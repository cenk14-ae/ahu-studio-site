-- ============================================================================
-- 23) E-POSTA DOĞRULAMASI ZORUNLU (28.11.2026) — Cenk: «mailini doğrulamayanları maili doğrulamaya zorla ekranda büyük
--     banner çıksın herşeyi kaplasın».
--     · Site (index.js «E-POSTA ZORUNLU»): lisanslar.eposta_dogrulandi boş hesapta girişten sonra tam ekran katman;
--       «Kod gönder» = eposta_kodu_gonder() (13/17-*.sql, değişmedi), «Doğrula» = aşağıdaki eposta_kodu_dogrula(kod).
--     · eposta_kodu_dogrula: lisans_basvur(…, kod) içindeki kod denetiminin (13-eposta-dogrulama.sql) BİREBİR aynısı —
--       süre (15 dk), 5 deneme, özet karşılaştırması (eposta_kod_ozeti), yanlışta deneme sayacı +1. Yanlış kod HATA
--       FIRLATMAZ (JSON döner), yoksa sayaç artışı işlemle birlikte geri alınırdı. Başarıda eposta_dogrulandi = now(),
--       kod silinir. Tek ek: kod satırı «for update» ile okunur — aynı anda gelen denemeler sırayla sayılır (paralel
--       isteklerle 5 deneme sınırı aşılamasın). Lisans başvurusu akışı (lisans_basvur) DEĞİŞMEDİ.
--     · Yalnız authenticated çalıştırır. Geri alma: 23-eposta-zorunlu.geri.sql.
--     · Program dosyası kapısı (dosya_izni) bu dosyada DEĞİŞMEZ — gerekçe ve ayrı taslak: iş raporu (28.11.2026).
--     SQL Editor'da tek seferde çalıştırılır.
-- ============================================================================

begin;

create or replace function public.eposta_kodu_dogrula(kod text)
returns json language plpgsql security definer set search_path = public as $$
declare l public.lisanslar; e public.eposta_kodlari;
begin
  if auth.uid() is null then raise exception 'oturum gerekli'; end if;
  select * into l from public.lisanslar where user_id = auth.uid();
  if l.user_id is null then
    return json_build_object('hata', 'hesap', 'mesaj', 'Hesap kaydı bulunamadı.');
  end if;
  if l.eposta_dogrulandi is not null then
    return json_build_object('tamam', true, 'zaten', true);
  end if;
  if nullif(trim(eposta_kodu_dogrula.kod), '') is null then
    return json_build_object('hata', 'kod', 'mesaj', 'E-postana gelen 6 haneli kodu yaz.');
  end if;
  select * into e from public.eposta_kodlari where user_id = auth.uid() for update;
  if e.user_id is null or e.son < now() then
    return json_build_object('hata', 'kod', 'mesaj', 'Kodun süresi doldu; yeni kod iste.');
  end if;
  if e.deneme >= 5 then
    return json_build_object('hata', 'kod', 'mesaj', 'Çok fazla yanlış deneme; yeni kod iste.');
  end if;
  if e.kod_ozet <> public.eposta_kod_ozeti(trim(eposta_kodu_dogrula.kod), auth.uid()) then
    update public.eposta_kodlari set deneme = deneme + 1 where user_id = auth.uid();
    return json_build_object('hata', 'kod', 'mesaj', 'Kod yanlış. Kalan deneme: ' || (4 - e.deneme));
  end if;
  update public.lisanslar set eposta_dogrulandi = now() where user_id = auth.uid();
  delete from public.eposta_kodlari where user_id = auth.uid();
  return json_build_object('tamam', true);
end $$;
revoke all on function public.eposta_kodu_dogrula(text) from public, anon;
grant execute on function public.eposta_kodu_dogrula(text) to authenticated;

commit;

-- Doğrulama (isteğe bağlı, salt okuma):
--   select proname, prosecdef, proconfig, has_function_privilege('anon', oid, 'execute') anon_calisir,
--          has_function_privilege('authenticated', oid, 'execute') uye_calisir
--   from pg_proc where proname = 'eposta_kodu_dogrula';      -- prosecdef t, search_path=public, anon f, üye t
--   select count(*) from public.lisanslar where eposta_dogrulandi is null;   -- katmanı görecek hesap sayısı
