// AHU Studio — site ayarları
// Supabase paneli → Project Settings → API sayfasındaki iki değeri buraya yaz.
// "publishable" anahtarı tarayıcıda durmak için yapılmıştır; asıl koruma veritabanındaki
// RLS kurallarıdır (supabase/kurulum.sql). "secret" anahtarını ASLA buraya yazma.
window.AHU_AYAR = {
  SUPABASE_URL: 'https://eqekvkfbysjzueywfiya.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_M2sVgklDJcK-6dcSNEfkcQ_PLsLY-mJ',
  KOVA: 'uygulama',                       // programların durduğu özel depolama kovası
  // Cloudflare Turnstile (robot koruması) — SİTE anahtarı herkese açıktır; GİZLİ anahtar yalnız Supabase'de
  TURNSTILE_SITE_KEY: '0x4AAAAAAFRqsqcVe9JvrZkv',
  LISANS_KONTROL_DK: 30,                  // açıkken lisans kaç dakikada bir yeniden sorulur

  // PROGRAMLAR — renk = kartın ve sekme simgesinin rengi; simge ikonlar.js'te (anahtar = id).
  // yöneticinin ana sayfasında birer kart olur. İlki varsayılandır:
  // Pro/Normal kullanıcı girişte DOĞRUDAN onu açar (rolüne göre tam ya da sade).
  // Yeni program eklerken: dosyayı Yönetim → Program dosyaları'ndan yükle, buraya bir
  // satır ekle ve kullanıcıların da açabilmesi gerekiyorsa supabase/kurulum.sql'deki
  // dosya_izni() fonksiyonuna dosya adını ekle (eklenmezse yalnız yönetici açar).
  PROGRAMLAR: [
    { id: 'ahu', renk: '#4d8dff', ad: 'AHU Studio', aciklama: 'Klima santrali panel konfigüratörü: 3B tasarım, DXF üretme, profil kesim listesi ve sac yerleşimi.',
      dosyalar: { tam: 'index.html', sade: 'index-sade.html' } },
    // Araçlarım (08.10.2026) — yalnız yönetici açar (dosya_izni bu adları vermez)
    { id: 'hesap', renk: '#8b7bff', ad: 'Hesap Merkezi', aciklama: '448 hesap, 7 araç — mekanik tesisat hesapları tek yerde.', dosyalar: { tek: 'araclar/hesap-merkezi.html' } },
    { id: 'batarya', renk: '#f0b445', ad: 'Batarya Onay Resmi Kontrolü', aciklama: "İmalatçının onay resmini sipariş föyü ve cihaz DXF'iyle karşılaştırır; ölçü ve kasa uyumunu denetler.", dosyalar: { tek: 'araclar/batarya.html' } },
    { id: 'order', renk: '#3fcf8e', ad: 'İş Emri & Malzeme Listesi', aciklama: "Projeler, iş emirleri ve malzeme listeleri; DXF'ten teknik resim ve PDF çıktısı.", dosyalar: { tek: 'araclar/order.html' } },
    { id: 'cfd', renk: '#22b8cf', ad: 'CFD Analiz Raporu', aciklama: 'Otopark jet fan CFD raporunu form üzerinden üretir; yazdır → PDF.', dosyalar: { tek: 'araclar/cfd-rapor.html' } },
    { id: 'rtu', renk: '#ff8a4c', ad: 'RTU Seçim Aracı', aciklama: 'Rooftop paket klima: 17 adımlık ön seçim sihirbazı ve soğutma çevrimi (şema, P-h diyagramı, komponent listesi).', dosyalar: { tek: 'araclar/rtu.html' } },
    { id: 'nem', renk: '#6fc3ff', ad: 'Buharlı Nemlendirici Seçimi', aciklama: 'Kapasite, ısıtıcı gücü, hazne hacmi, elektrik, buhar hattı ve yıllık işletme gideri — psikrometri ile.', dosyalar: { tek: 'araclar/buharli-nemlendirici.html' } },
    { id: 'sukacagi', renk: '#2ec4a6', ad: 'Su Kaçağı Koruma Setleri', aciklama: 'Aqara ve Tuya tabanlı 5 set: saha durumuna göre öneri, düzenlenebilir fiyat listesi ve maliyet karşılaştırması.', dosyalar: { tek: 'araclar/su-kacagi.html' } },
    { id: 'plan', renk: '#e563c9', ad: 'Ev ve Araç Alım Planı', aciklama: '120 aylık birikim projeksiyonu, BDDK kredi sınırları, kur şoku testi ve tasarruf finansmanı karşılaştırması.', dosyalar: { tek: 'araclar/ev-arac-plani.html' } },
    { id: 'uvc', renk: '#b07cff', ad: 'UV-C Lamba Seçimi', aciklama: 'Klima santrali kasasına UV-C lamba modeli, adedi ve yerleşimi; serpantin ışınımı ve hava dezenfeksiyonu dozu.', dosyalar: { tek: 'araclar/uvc-lamba.html' } },
    { id: 'otopark', renk: '#ef6461', ad: 'Otopark Akış Simülatörü', aciklama: 'Jet fan, egzoz ve basınçlandırmanın 2B akış simülasyonu: ölü bölge, duman yayılımı ve bekleme süresi analizi.', dosyalar: { tek: 'araclar/otopark-akis.html' } },
    // 08.10.2026 ikinci parti. '.gz' dosya: yükleyici açarken çözer (10 MB üstü programlar)
    { id: 'sartname', renk: '#5ce1e6', ad: 'Şartname Çözümleyici', aciklama: 'AHU, rooftop ve IGK şartnamelerini (PDF, Word, Excel, taranmış belge) okuyup çözümler.', dosyalar: { tek: 'araclar/sartname-cozumleyici.html.gz' } },
    { id: 'lazer', renk: '#ff4d9d', ad: 'Lazer ERP', aciklama: 'Lazer kesim üretim yönetimi: işler, planlama ve atölye takibi.', dosyalar: { tek: 'araclar/lazer-erp.html' } },
    { id: 'atolye', renk: '#c9a26b', ad: 'Atölye Hesap Araçları', aciklama: 'Sac/profil ağırlığı, firesiz profil boy kesimi, DXF metrajı ve diğer atölye hesapları.', dosyalar: { tek: 'araclar/atolye-hesap-araclari.html' } },
    { id: 'bukum', renk: '#91a7bd', ad: 'Sac Büküm Simülatörü', aciklama: 'Sac büküm simülasyonu ve büküm raporu.', dosyalar: { tek: 'araclar/sac-bukum-simulatoru.html' } },
    { id: 'maliyet', renk: '#ffd43b', ad: 'HVAC Proje Maliyet', aciklama: 'HVAC projelerinin maliyet hesabı.', dosyalar: { tek: 'araclar/hvac-maliyet.html' } },
    { id: 'kontrol', renk: '#a9e34b', ad: 'Kontrol Tezgâhı', aciklama: 'Nem alma santrali kontrol tezgâhı: santral tasarımı, ESP32 yazılımı (.bin) ve kaynak kodu.', dosyalar: { tek: 'araclar/kontrol-tezgahi.html' } }
  ]
};
// Eski adla okuyan kod için (yönetim sayfasının dosya listesi)
window.AHU_AYAR.DOSYALAR = window.AHU_AYAR.PROGRAMLAR[0].dosyalar;
