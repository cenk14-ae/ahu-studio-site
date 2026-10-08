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
   *Redirect URLs*'e `https://cenkaltinay.com/**` ekle (doğrulama ve şifre sıfırlama e-postaları buraya döner).
5. **Authentication → Sign In / Providers → Email**: açık; *Confirm email* açık kalsın.

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
- **Yeni müşteri:** kendisi kayıt olur → Yönetim'de *Aktif* işaretle, sürüm + bitiş seç → Kaydet.
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
