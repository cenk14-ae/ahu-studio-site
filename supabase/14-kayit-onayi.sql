-- 14) YENİ KAYIT ONAYLA AÇILIR (06.11.2026, G-0015, Cenk: «siteye birisi yeni kayıt olduğunda otomatikmen açılıyor
--     mail onayı olmadan ve ben onay vermeden açılmasın»)
--     · Auth «Confirm email» AÇIK (mailer_autoconfirm = false; Yönetim API ile, SQL değil): e-postasını doğrulamayan giremez.
--     · Yeni hesap KAPALI doğar: aktif = false, demo, sürüm tam, bitiş yok, not «Onay bekliyor (kayıt GG.AA.YYYY)…».
--       (11-deneme.sql'deki «kayıt olan hemen 7 gün demo» akışının yerine geçer.)
--     · Onay anı: Cenk Yönetim'de «Aktif»i işaretleyip Kaydet'e basınca lisans_onay_demo tetikleyicisi
--       (demo ve bitiş boşsa) bitişi bugün + 7 yapar — 7 günlük demo onay günü başlar.
--     · yeni_kullanici() sonra 17-kayit-dogrulama-ve-eposta-kodu.sql ile ad/firma kırpma eklenerek yeniden tanımlandı.
--     Canlıya uygulandı 06.11.2026 (.ajan/isler/20261106-kayit-onay/uygula.mjs, YENI_SQL birebir).
begin;
-- Yeni hesap KAPALI doğar: aktif = false. Cenk Yönetim'de «Aktif»i işaretleyene kadar «Onay bekleniyor».
create or replace function public.yeni_kullanici()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.lisanslar (user_id, eposta, ad, firma, aktif, demo, surum, bitis, notlar)
  values (new.id, new.email,
          new.raw_user_meta_data->>'ad',
          new.raw_user_meta_data->>'firma',
          false, true, 'tam', null,
          'Onay bekliyor (kayıt ' || to_char(current_date, 'DD.MM.YYYY') || '). Aktif işaretlenince 7 günlük demo o gün başlar.')
  on conflict (user_id) do nothing;
  return new;
end $$;
revoke execute on function public.yeni_kullanici() from public, anon, authenticated;

-- Onay anı: aktif false -> true, demo ve bitiş boşsa bitiş = bugün + 7 (demo süresi onaydan başlar)
create or replace function public.lisans_onay_demo()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(old.aktif, false) = false and new.aktif = true and new.demo = true and new.bitis is null then
    new.bitis := current_date + 7;
  end if;
  return new;
end $$;
revoke execute on function public.lisans_onay_demo() from public, anon, authenticated;
drop trigger if exists lisans_onay_demo on public.lisanslar;
create trigger lisans_onay_demo before update on public.lisanslar
  for each row execute function public.lisans_onay_demo();
commit;

-- 14b) 07.11.2026 DÜZELTME (G-0014 kontrol B1, Cenk onayı): Yönetim sayfası ikinci Kaydet'te bitis=null
--      gönderebiliyordu; tetikleyici yalnız false→true geçişinde çalıştığı için demo süresiz kalıyordu.
--      Artık: demo hesap aktifken bitiş boş kalamaz → boş gelirse eski bitiş korunur, yoksa (ilk onay) bugün + 7.
--      Canlıya uygulandı: .ajan/isler/20261106-kayit-onay/b1-duzelt.mjs (sınama b1-sinama.json, yedek yedek/b1-onceki.sql).
create or replace function public.lisans_onay_demo()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.aktif = true and new.demo = true and new.bitis is null then
    new.bitis := coalesce(old.bitis, current_date + 7);
  end if;
  return new;
end $$;
revoke execute on function public.lisans_onay_demo() from public, anon, authenticated;