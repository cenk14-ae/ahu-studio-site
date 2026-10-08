// AHU Studio — site ayarları
// Supabase paneli → Project Settings → API sayfasındaki iki değeri buraya yaz.
// "publishable" anahtarı tarayıcıda durmak için yapılmıştır; asıl koruma veritabanındaki
// RLS kurallarıdır (supabase/kurulum.sql). "secret" anahtarını ASLA buraya yazma.
window.AHU_AYAR = {
  SUPABASE_URL: 'https://eqekvkfbysjzueywfiya.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_M2sVgklDJcK-6dcSNEfkcQ_PLsLY-mJ',
  KOVA: 'uygulama',                       // programların durduğu özel depolama kovası
  LISANS_KONTROL_DK: 30,                  // açıkken lisans kaç dakikada bir yeniden sorulur

  // PROGRAMLAR — yöneticinin ana sayfasında birer kart olur. İlki varsayılandır:
  // Pro/Normal kullanıcı girişte DOĞRUDAN onu açar (rolüne göre tam ya da sade).
  // Yeni program eklerken: dosyayı Yönetim → Program dosyaları'ndan yükle, buraya bir
  // satır ekle ve kullanıcıların da açabilmesi gerekiyorsa supabase/kurulum.sql'deki
  // dosya_izni() fonksiyonuna dosya adını ekle (eklenmezse yalnız yönetici açar).
  PROGRAMLAR: [
    { id: 'ahu', ad: 'AHU Studio', aciklama: 'Klima santrali kapak yerleşimi, DXF ve Excel üretimi',
      dosyalar: { tam: 'index.html', sade: 'index-sade.html' } }
  ]
};
// Eski adla okuyan kod için (yönetim sayfasının dosya listesi)
window.AHU_AYAR.DOSYALAR = window.AHU_AYAR.PROGRAMLAR[0].dosyalar;
