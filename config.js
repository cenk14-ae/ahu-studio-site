// AHU Studio — site ayarları
// Supabase paneli → Project Settings → API sayfasındaki iki değeri buraya yaz.
// "anon public" anahtarı tarayıcıda durmak için yapılmıştır; asıl koruma veritabanındaki
// RLS kurallarıdır (supabase/kurulum.sql). "service_role" anahtarını ASLA buraya yazma.
window.AHU_AYAR = {
  SUPABASE_URL: 'https://PROJE-KIMLIGI.supabase.co',
  SUPABASE_ANON_KEY: 'BURAYA-ANON-PUBLIC-ANAHTARI',
  KOVA: 'uygulama',                       // programın durduğu özel depolama kovası
  DOSYALAR: { tam: 'index.html', sade: 'index-sade.html' },
  LISANS_KONTROL_DK: 30                   // açıkken lisans kaç dakikada bir yeniden sorulur
};
