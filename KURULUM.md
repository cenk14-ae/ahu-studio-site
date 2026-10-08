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

## Günlük kullanım
- **Yeni müşteri:** kendisi kayıt olur → Yönetim'de *Aktif* işaretle, sürüm + bitiş seç → Kaydet.
- **Program güncellemesi:** `SANTRAL APP`'te `_sade-uret.js` ile iki sürümü üret → Yönetim → *Yükle / güncelle*.
  Kullanıcılar bir sonraki açılışta yeni sürümü alır. **GitHub'a bir şey göndermek gerekmez.**
- **Süre dolarsa:** açık oturum kesilmez (kaydedilmemiş proje kaybolmasın), uyarı çıkar; sonraki girişte açılmaz.

## Dürüst sınırlar
- İndirilen program kullanıcının tarayıcısında çalışır; lisanslı biri dosyayı DevTools ile kaydedip
  çevrimdışı kullanabilir. Bu sistem **lisanssız erişimi** engeller, lisanslı kullanıcının kopyalamasını değil.
- Aynı hesabın birden çok cihazda kullanılması şu an sınırlanmıyor (ileride eklenebilir).
- Tam sürümdeki şifre kapısı (`#giris`) yerinde kalır — tam sürüm için ikinci bir kilit.
