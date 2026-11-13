# AHU Studio — site kurulumu

```
Tarayıcı ──► cenkaltinay.com (GitHub Pages)  : yalnız giriş + yönetim sayfası (herkese açık, program YOK)
                 │ giriş
                 ▼
             Supabase  ── Auth (e-posta + şifre)
                       ── lisanslar tablosu (RLS)
                       ── "uygulama" ÖZEL kovası: index.html (tam) · index-sade.html (sade)
                 │ lisans geçerliyse dosya iner
                 ▼
             program tam ekran çerçevede açılır
```

**Program GitHub'a hiç girmez.** Depo herkese açıktır ama içinde yalnız giriş sayfası durur;
`index.html` / `index-sade.html` yalnız Supabase'in özel kovasında durur ve RLS onu yalnız
geçerli lisansı olana verir (sade lisans → sade dosya, tam lisans → ikisi).

## 1. Supabase
1. supabase.com → GitHub ile giriş → **New project** (bölge: Frankfurt `eu-central-1`).
2. **SQL Editor** → `supabase/kurulum.sql`'in tamamını yapıştır → **Run**.
3. **Project Settings → API**: `Project URL` ve `anon public` anahtarını `config.js`'e yaz.
4. **Authentication → URL Configuration**: *Site URL* = `https://cenkaltinay.com`,
   *Redirect URLs*'te YALNIZ `https://cenkaltinay.com/` (G-0016: `**` yok, www yok — www.cenkaltinay.com kök alan adına
   301 ile yönlenir). Kod (index.js `DONUS_ADRESI`) doğrulama, yeniden gönderme ve şifre sıfırlama bağlantılarını hep
   sitenin köküne döndürür.
5. **Authentication → Sign In / Providers → Email**: açık; *Confirm email* AÇIK (G-0015, 06.11.2026): kayıt olan
   e-postasını doğrulamadan giremez. Doğrulama e-postası Türkçe (konu «AHU Studio — e-posta adresini doğrula»),
   bağlantı `https://cenkaltinay.com/` adresine döner. G-0016: site PKCE akışı kullanır (dönüş `?code=…`); e-posta
   şablonları `{{ .ConfirmationURL }}` ile değişmeden çalışır. Bağlantı, isteğin yapıldığı tarayıcıda açılmalıdır;
   başka tarayıcıda adres yine doğrulanır, kullanıcı şifresiyle girer.

## 2. GitHub Pages
1. Bu klasör bir depo olarak yüklenir (`ahu-studio-site`), **Settings → Pages** → *Deploy from branch* → `main` / `/ (root)`.
2. *Custom domain* kutusuna alan adını yaz → *Enforce HTTPS* (sertifika birkaç dakika sürer).

## 3. Natro DNS (Alan adı → DNS Yönetimi)
| Tür | Ad | Değer |
|---|---|---|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | `KULLANICIADI.github.io` |

Natro'nun kendi park/yönlendirme A kayıtları varsa silinir. Yayılması 10 dk – birkaç saat.

## 4. İlk giriş
1. Sitede **Kayıt ol** (cenk.altinay@gmail.com) → e-postayı doğrula.
2. SQL Editor'de `kurulum.sql`'in **7. bloğunu** tekrar çalıştır → yönetici + tam lisans.
3. Sitede giriş → **Yönetim** → *Program dosyaları*: `index.html` ve `index-sade.html`'i yükle.

## Roller
| Rol | Ne açar | Nasıl verilir |
|---|---|---|
| **Yönetici** (Cenk) | tam sürüm + Yönetim sayfası | yalnız SQL: `yoneticiler` tablosu |
| **Pro** | tam sürüm (AHU Studio'nun tamamı) | Yönetim → Rol: *Pro* |
| **Normal** | sade sürüm | Yönetim → Rol: *Normal* (kayıtta varsayılan) |

**Program izinleri:** her kullanıcının açabildiği programlar `lisanslar.programlar` (Yönetim → satırın altındaki aç/kapat düğmeleri; yeni kayıt yalnız AHU Studio ile başlar). Program ↔ dosya eşlemesi `programlar` tablosunda (`supabase/2-program-izinleri.sql`), ad/simge/renk `config.js` + `ikonlar.js`'te — **kimlikler iki yerde aynı olmalı**. Birden çok programı olan kullanıcı girişte kendi ana sayfasını görür, tek programı olan doğrudan açar. **Antet:** AHU Studio Excel antetinin ÇİZEN hücresi kullanıcının *Ad Soyad*'ından gelir (Yönetim'de düzenlenir).

Veritabanında rol `lisanslar.surum` alanıdır (`tam` = Pro, `sade` = Normal); izin depo kuralında (`dosya_izni`) uygulanır.

## Günlük kullanım
- **Yeni müşteri** (06.11.2026'dan beri, G-0015): kendisi kayıt olur → e-postasındaki bağlantıyla adresini doğrular
  (doğrulamadan giremez; gelmezse giriş ekranındaki «Doğrulama e-postasını yeniden gönder») → hesap **onay bekler**
  (pasif; girişte «Onay bekleniyor» görür) → Cenk Yönetim'de «Aktif»i işaretleyip Kaydet'e basar → **7 günlük demo o gün
  başlar** (Demo + Pro, bitiş = onay günü + 7, yalnız AHU Studio; tetikleyici `lisans_onay_demo`, `supabase/14-kayit-onayi.sql`).
  Kullanıcı tablosunda e-postanın yanında «✓ doğrulandı» / «doğrulanmadı» görünür: doğrulamamış birini Aktif yapsan bile
  bağlantıya tıklayana kadar giremez. Lisans verince Yönetim'de *Demo*'yu kaldır, sürüm + bitiş seç → Kaydet.
  Süre dolan deneme girişte «Deneme süresi doldu» görür. (Eski «kayıt olan hemen 7 gün demo» akışı, `11-deneme.sql`, kalktı.)
- **Bildirim e-postaları** (`supabase/12-bildirim.sql` + Edge Function `bildirim`): her yeni kayıtta (kayıt anında,
  e-posta doğrulanmadan önce — hesap «Onay bekliyor» olarak gelir) ve her
  **lisans başvurusunda** yöneticiye e-posta gelir (Resend, gönderen `bildirim@cenkaltinay.com`). Kullanıcının e-postasını
  doğrulayıp doğrulamadığı Yönetim'deki kullanıcı tablosunda görünür. Lisans başvurusu:
  demo kullanıcı sağ alttaki «Lisans başvurusu», süresi dolan girişteki «Lisans başvurusu yap» düğmesiyle form
  doldurur; başvurular Yönetim'in en üstünde de listelenir. Ayarlar fonksiyonun gizli ayarlarında:
  `RESEND_API_KEY`, `BILDIRIM_ALICI`, `BILDIRIM_GONDEREN`, `BILDIRIM_SIRRI` (= vault `bildirim_sirri`).
  Gönderim sonuçları: SQL `select * from net._http_response order by created desc`.
- **E-posta doğrulaması** (06.11.2026, G-0015 + G-0014): Auth'ta *Confirm email* AÇIK — kayıt olan e-postasını
  doğrulamadan giremez. Kanıt `lisanslar.eposta_dogrulandi`: kullanıcı doğrulama bağlantısına tıklayınca dolar
  (`supabase/17-kayit-dogrulama-ve-eposta-kodu.sql`, tetikleyici `kullanici_dogrulandi`; gönderilmiş bir doğrulama
  e-postası şart, auto-confirm doğrulama sayılmaz). Lisans başvurusundaki **6 haneli kod** (`13-eposta-dogrulama.sql`)
  yalnız 23.10–06.11 arasında doğrulamasız açılmış eski hesaplar için kalır: «Kod gönder» → 15 dk geçerli, 5 deneme,
  dakikada 1 / saatte 5 / **günde en çok 10** kod, e-postada ad yok. Auth e-postaları (doğrulama, şifre sıfırlama)
  Resend SMTP ile `noreply@cenkaltinay.com`'dan gider.
- **Program güncellemesi** (çekirdek sunucuda — sıra ÖNEMLİ):
  1. `SANTRAL APP`'te `_sade-uret.js` → `_sunucu-uret.js` (ince dosyalar `cevrimici/`'ye + sunucu paketi)
  2. `sunucu-esdeger-test.js` → 0 fark
  3. sunucuyu yayınla (`supabase functions deploy cekirdek --use-api`)
  4. Yönetim → *Program dosyaları*: `cevrimici/index-ince.html` → **index.html**, `cevrimici/index-sade-ince.html` → **index-sade.html**
  Eski sayfası açık kalan kullanıcı «Program güncellendi — sayfayı yenileyin» uyarısı alır (sürüm damgası). **GitHub'a bir şey göndermek gerekmez.**
- **Süre dolarsa:** açık oturum kesilmez (kaydedilmemiş proje kaybolmasın), uyarı çıkar; sonraki girişte açılmaz.

## Dürüst sınırlar
- İndirilen program kullanıcının tarayıcısında çalışır; lisanslı biri dosyayı DevTools ile kaydedip
  çevrimdışı kullanabilir. Bu sistem **lisanssız erişimi** engeller, lisanslı kullanıcının kopyalamasını değil.
- Aynı hesabın birden çok cihazda kullanılması şu an sınırlanmıyor (ileride eklenebilir).
- Tam sürümdeki şifre kapısı (`#giris`) yerinde kalır — tam sürüm için ikinci bir kilit.

## Güvenlik sınırları (G-0014, 06.11.2026)
Veritabanı kayıtları `supabase/15…19` (taslaklar ve geri alma dosyaları: `.ajan/isler/20261106-supabase-uygula/taslak/`).
- **Kütüphane kotası** (`16-kutuphane-cop-kota.sql`): kütüphane (kişisel ya da firma) başına en çok **1000 kayıt / 300 klasör**;
  yönetici muaf. Dolunca kullanıcıya «Kütüphane dolu…» iletisi döner.
- **Çöp damgası sunucuda** (aynı dosya): çöpe atma zamanını istemci belirleyemez (geçmiş tarihle kalıcı silme atlatılamaz);
  kalıcı silme yalnız 30 gün sonra ya da yönetici.
- **Etkinlik kaydı sınırı** (`18-etkinlik-siniri.sql`): kullanıcı başına saatte **100 ziyaret / 3000 olay**; olay zamanı en çok
  10 dk geriye yazılabilir.
- **Yönetici notu kullanıcıya görünmez** (`19-lisans-notlari.sql`): `authenticated` rolü `lisanslar.notlar` sütununu okuyamaz;
  Yönetim notları `yonetici_lisans_notlari()` RPC'siyle okur (yalnız yönetici satır alır). Yönetim'de notlar okunamazsa not
  kutusu kapanır ve Kaydet notlara dokunmaz.
- **Yetkiler** (`15-yetki-sikilastirma.sql`): `anon` ve `authenticated` rollerinde TRUNCATE / REFERENCES / TRIGGER / MAINTAIN yok
  (varsayılan yetkilerde de). Yeni tablo açarken yalnız gereken yetkileri (SELECT/INSERT/UPDATE/DELETE) ver.
- **Kayıt** (`17-kayit-dogrulama-ve-eposta-kodu.sql`): ad 120, firma 160 karaktere kırpılır; e-posta doğrulaması yukarıda.
- **Kullanıcı silme** Edge Function `kullanici-sil` ile (`supabase/functions/kullanici-sil/index.ts`): hesap `kullanici_sil`
  kurallarıyla silinir (yönetici ve kendi hesabın silinemez), ardından bulut program verisi (`kullanici-verisi/<uid>/`)
  Storage API ile silinir. Yayın: `npx supabase functions deploy kullanici-sil --project-ref eqekvkfbysjzueywfiya --use-api`
  (**verify_jwt açık** — `--no-verify-jwt` KULLANMA).
- **Yönetici iki adımlı doğrulama (TOTP):** Yönetim → *İki adımlı doğrulama* → Başlat → QR'ı doğrulama uygulamasıyla tara,
  gizli anahtarı güvenli yere yaz → 6 haneli kod → Doğrula. Faktörü olan hesaba girişte şifreden sonra kod sorulur.
  Taslak 05 (`yonetici_mi` için aal2 şartı) uygulanınca kayıt `supabase/20-yonetici-mfa.sql` olarak eklenir; o zamandan
  sonra kodsuz (aal1) oturum Yönetim'e giremez. Telefon kaybolur ve yedek anahtar yoksa: SQL Editor'da taslak 05'in
  `.geri.sql`'ini çalıştır (SQL Editor MFA istemez), Authentication → Users → hesabın → Factors'tan eski faktörü sil.
- **Şifre kuralı:** site yeni şifrelerde (kayıt, şifre sıfırlama, Şifre değiştir) en az 10 karakter, küçük + büyük harf + rakam
  ister (tarayıcıda denetlenir; girişte eski şifreler geçer). Sunucu tarafı Supabase panel ayarıdır (`uygula.mjs --panel`, ayrı onay):
  uygulanınca aynı kural sunucuda da zorunlu olur, şifre değişiminde yeniden doğrulama açılır ve eski şifreyle giren kullanıcıya
  site «Şifren yeni kurallara uymuyor» bilgisini verir (giriş sürer).
- **Data API → Exposed schemas** listesine `net` ya da `vault` **EKLENMEZ** (yalnız `public` ve `graphql_public`).

## Kullanıcı verisi (08.10.2026)
Programlar (blob iframe) sitenin kökeninde çalıştığı için localStorage/IndexedDB **bütün kullanıcılar
ve programlarca ortaktı**. Artık her programın verisi **kullanıcıya ve programa ait ad alanında** durur
ve **buluta** yazılır; kullanıcılar birbirininkini göremez. **Programların kendisi değişmedi.**
- `veri-katmani.js` — yükleyici bunu program HTML'inin `<head>`'ine gömer: `localStorage` ve
  `indexedDB.open/deleteDatabase/databases` adlarını `<uid>:<program>:` önekine çevirir, programın
  kendi srcdoc çerçevelerine (Hesap Merkezi, RTU) kendini yeniden gömer, değişikliği yükleyiciye bildirir.
- `kullanici-verisi.js` — yükleyici tarafı: ad alanının anlık görüntüsü (localStorage + IndexedDB
  şema/kayıt, Blob/ArrayBuffer base64) → gzip → özel kova **`kullanici-verisi`**, yol
  `<uid>/<program>.json.gz`. Son değişiklikten 3 sn sonra ve sekme gizlenince yazar; içerik aynıysa
  yazmaz. Açılışta program AÇILMADAN önce bulut başka cihazda değişmişse ad alanını ondan kurar
  (son yazan kazanır; tek oturum aynı anda tek cihazı garanti eder). **Bulut okunamazsa program açılmaz**
  (boş açılıp buluttakini ezmesin). Sayfa kapanırken yetişmeyen yazım bir sonraki açılışta yapılır.
- Sağ alt menüde gösterge: *Bulut: kaydedildi hh:mm / kaydediliyor / buluttan alındı / yazılamadı*.
- **Depo kuralı** `supabase/5-kullanici-verisi.sql` (`veri_izni`): yalnız **kendi klasörü** + geçerli lisans +
  aktif oturum bu cihazda + program kullanıcıya açık. **Yönetici de başkasının klasörünü okuyamaz.**
- **Geçiş:** yönetici bir programı ilk açtığında bulutta kaydı yoksa ad alansız ESKİ veri (ör. IndexedDB
  `lazercrm`) ad alanına kopyalanır ve yüklenir; **eskisi silinmez** (yedek). Yönetici olmayanda geçiş yok.
- **Kapsam dışı:** AHU Studio (projeler dosyaya kaydedilir; ince istemci Supabase belirtecini
  localStorage'dan okur). Şartname'nin OCR dil önbelleği (`keyval-store`, Worker içinde) buluta yazılmaz.
  Lazer ERP'nin yedek klasörü tanıtıcısı (FileSystemHandle) serileştirilemez — her cihazda yeniden seçilir.
- Doğrulama: `dogrulama/kullanici-verisi-tarayici.js` (gerçek Chrome + sahte Supabase, 47 kontrol).

## Santral kütüphanesi (09.10.2026)

AHU Studio kullanıcıları santralleri klasörlü bir kütüphanede saklar: **Kişisel** (yalnız sahibi) ve
**Firma** (aynı firmaya atanmış geçerli lisanslılar, hepsi ekler/düzenler/taşır/siler). Yönetici hepsini görür.
Normal proje çalışması sunucuya yazılmaz — yalnız kullanıcının açıkça «Buraya kaydet» dediği santral.

- **SQL** `supabase/7-kutuphane.sql` (1–6'dan sonra): `firmalar`, `lisanslar.firma_id`, `kutuphane_klasor`,
  `kutuphane_kayit` (santral jsonb, en fazla 2 MB), RLS kapısı `kutuphane_erisim` (lisans + AHU izni + tek oturum;
  yönetici muaf), tetikleyici (kimlik damgası, kapsam tutarlılığı, klasör döngüsü), çöp kutusu
  `kutuphane_sil` / `kutuphane_geri_al` (30 gün; kalıcı silme yalnız yönetici), `kutuphane_temizle`, `kutuphane_baglam`.
- **Arayüz** `kutuphane.js` (yükleyici): AHU Studio'nun 3B Tasarım araç çubuğundaki **Kütüphane** düğmesi
  açar (düğme yalnız site içinde görünür). Köprü f0 ↔ `window.top`, aynı köken + program çerçevesi şartı.
- **Yönetim → Firmalar**: firma ekle / adlandır / sil (firma silinince ortak kütüphanesi de silinir);
  kullanıcıyı firmaya kullanıcı tablosundaki seçimle ata.
