-- 16) KÜTÜPHANE ÇÖP DAMGASI + KOTA (06.11.2026, G-0014 taslak 02; Cenk onayı 06.11.2026)
--     Durum: canlıya uygulandı 06.11.2026 14:35; geri alınıp yeniden uygulandı 14:36 (geri alma sınaması).
--     Bu dosya taslağın @@UYGULA bölümüdür (birebir); uygula.mjs onu tek istekte (tek örtük işlem) gönderdi.
--     SQL Editor'da da tek seferde çalıştırılır. Geri alma ve doğrulama sorguları iş klasöründe:
--     .ajan/isler/20261106-supabase-uygula/taslak/02-kutuphane-cop-ve-kota.sql (+ .geri.sql).
--
--   G-0014 / taslak 02 — Kütüphane çöp damgası + kota (G-0013 S4-a, S4-b). Kaynak: G-0013 duzeltme/02 (içerik aynı;
--   Cenk onayı 06.11: 1000 kayıt / 300 klasör). Biçim: bkz. 01. Geri alma: 02-kutuphane-cop-ve-kota.geri.sql (birebir).

create or replace function public.kutuphane_tetik()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ust uuid; u record; kim uuid := auth.uid(); adet integer;
  KOTA_KAYIT  constant integer := 1000;   -- kütüphane (kapsam+sahip) başına kayıt
  KOTA_KLASOR constant integer := 300;    -- kütüphane başına klasör
begin
  if tg_op = 'INSERT' then
    if new.kapsam = 'kisi'  and not exists (select 1 from public.lisanslar where user_id = new.sahip) then
      raise exception 'Kütüphane sahibi bulunamadı.'; end if;
    if new.kapsam = 'firma' and not exists (select 1 from public.firmalar where id = new.sahip) then
      raise exception 'Firma bulunamadı.'; end if;
    -- KOTA (S4-b): yönetici muaf
    if not public.yonetici_mi() then
      if tg_table_name = 'kutuphane_kayit' then
        select count(*) into adet from public.kutuphane_kayit where kapsam = new.kapsam and sahip = new.sahip;
        if adet >= KOTA_KAYIT then
          raise exception 'Kütüphane dolu (en çok % kayıt). Çöp kutusunu boşaltın ya da yöneticiye başvurun.', KOTA_KAYIT; end if;
      else
        select count(*) into adet from public.kutuphane_klasor where kapsam = new.kapsam and sahip = new.sahip;
        if adet >= KOTA_KLASOR then
          raise exception 'Kütüphane dolu (en çok % klasör).', KOTA_KLASOR; end if;
      end if;
    end if;
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
    -- çöpe atma / geri alma damgası (S4-a: damga SUNUCUDA konur, istemcinin değeri yok sayılır)
    if new.silindi is not null and old.silindi is null then
      new.silindi := now();
      new.silen := kim; new.silen_ad := case when kim is null then null else public.kutuphane_kisi_adi(kim) end;
    elsif new.silindi is not null and old.silindi is not null then
      new.silindi := old.silindi; new.silen := old.silen; new.silen_ad := old.silen_ad; new.silme_kok := old.silme_kok;
    else  -- new.silindi is null (canlı kalıyor ya da geri alındı)
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

  -- üst klasör (yalnız eklerken ya da taşınırken denetlenir) — DEĞİŞMEDİ
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
-- create or replace yetkiyi değiştirmez; yine de açıkça (7-kutuphane.sql ile aynı)
revoke execute on function public.kutuphane_tetik() from public, anon, authenticated;
