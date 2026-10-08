// AHU Studio — site ayarları
// Supabase paneli → Project Settings → API sayfasındaki iki değeri buraya yaz.
// "publishable" anahtarı tarayıcıda durmak için yapılmıştır; asıl koruma veritabanındaki
// RLS kurallarıdır (supabase/kurulum.sql). "secret" anahtarını ASLA buraya yazma.
window.AHU_AYAR = {
  SUPABASE_URL: 'https://eqekvkfbysjzueywfiya.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_M2sVgklDJcK-6dcSNEfkcQ_PLsLY-mJ',
  KOVA: 'uygulama',                       // programın durduğu özel depolama kovası
  DOSYALAR: { tam: 'index.html', sade: 'index-sade.html' },
  LISANS_KONTROL_DK: 30                   // açıkken lisans kaç dakikada bir yeniden sorulur
};
