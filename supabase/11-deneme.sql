-- 11) OTOMATİK 7 GÜNLÜK DEMO DENEME (23.10.2026, Cenk: «sitemizde demo için başvuranlar otomatik demo deneme
--     hakkına sahip olsunlar 7 günlük»)
--     Kayıt olan her yeni hesap onay beklemeden AÇIK doğar: aktif + demo (dosya indirme kapalı, kapı sunucuda)
--     + Pro (tam sürüm, arayüzün tamamı görünsün) + bitiş = bugün + 7. Program: varsayılan '{ahu}'.
--     Süre dolunca lisans_gecerli_mi kendiliğinden kapatır; giriş ekranı «deneme süresi doldu» der.
--     Gerçek lisans: Yönetim'de Demo işaretini kaldır, bitişi değiştir/boşalt → Kaydet.
create or replace function public.yeni_kullanici()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.lisanslar (user_id, eposta, ad, firma, aktif, demo, surum, bitis, notlar)
  values (new.id, new.email,
          new.raw_user_meta_data->>'ad',
          new.raw_user_meta_data->>'firma',
          true, true, 'tam', current_date + 7,
          'Otomatik 7 günlük demo deneme (kayıt ' || to_char(current_date, 'DD.MM.YYYY') || ')')
  on conflict (user_id) do nothing;
  return new;
end $$;

-- 6-guvenlik.sql'deki kısıt yeniden tanımda korunur (create or replace yetkiyi değiştirmez; yine de açıkça)
revoke execute on function public.yeni_kullanici() from public, anon, authenticated;
