(function(){
  'use strict';
  const A = window.AHU_AYAR;
  const $ = id => document.getElementById(id);
  if (!window.supabase || !A || A.SUPABASE_URL.indexOf('PROJE-KIMLIGI') >= 0) {
    mesaj('Site henüz yapılandırılmadı (config.js) ya da bağlantı yok.', 'hata');
    $('form').querySelectorAll('input,button').forEach(e => e.disabled = true);
    return;
  }
  // DOĞRULAMA / ŞİFRE SIFIRLAMA BAĞLANTISINDAN DÖNÜŞ (G-0014 §1.5, G-0016 S5) — adres createClient'tan ÖNCE okunur
  // (supabase-js adresi sonra temizler). G-0016: PKCE akışı (oturum enjeksiyonu / login CSRF kapanır).
  // Kaynak: Supabase «PKCE flow» https://supabase.com/docs/guides/auth/sessions/pkce-flow (kod 5 dk geçerli, tek kullanımlık,
  // takas AYNI tarayıcıda olmalı); supabase-js 2.119.0 GoTrueClient _initialize / _isPKCECallback / _exchangeCodeForSession;
  // supabase/auth internal/api/verify.go (signupVerify → user.Confirm; prepPKCERedirectURL ?code=; prepErrorRedirectURL).
  //  · Başarılı dönüş ?code=… : bu tarayıcıda saklı doğrulayıcı (code verifier) VARSA supabase-js kodu kendisi oturuma çevirir
  //    (detectSessionInUrl) ve adresten siler → kayıt doğrulamasında SIGNED_IN (karşılamaya «E-posta adresin doğrulandı.»),
  //    şifre sıfırlamada PASSWORD_RECOVERY.
  //  · Doğrulayıcı YOKSA (bağlantı başka tarayıcıda/cihazda açıldı) supabase-js takası hiç denemez → PKCE_FARKLI iletisi.
  //    Adres sunucuda /verify adımında zaten doğrulanmıştır; kullanıcı şifresiyle girebilir.
  //  · Hatalı dönüş: error/error_code # parçasında, PKCE'de ayrıca ?sorguda gelir → ikisi de okunur; yalnız error_code sabit
  //    Türkçe metinle eşlenir, error_description basılmaz.
  //  · Eski (implicit) bağlantı #access_token=… artık oturum KURMAZ (supabase-js pkce kipinde reddeder) → Türkçe ileti.
  const ADRES_HASH = new URLSearchParams(location.hash.replace(/^#/, ''));
  const ADRES_ARA = new URLSearchParams(location.search);
  const PKCE_KODU = ADRES_ARA.get('code');
  const ESKI_BAGLANTI = ADRES_HASH.has('access_token') ? (ADRES_HASH.get('type') || 'diger') : null;
  const HATA_KAYNAGI = (ADRES_ARA.has('error') || ADRES_ARA.has('error_code')) ? ADRES_ARA : ADRES_HASH;
  const dogrulamaDonusu = !!PKCE_KODU;
  const donusHatasi = HATA_KAYNAGI.has('error') || HATA_KAYNAGI.has('error_code') ? (HATA_KAYNAGI.get('error_code') || 'hata') : null;
  let kurtarmaDonusu = false;   // PASSWORD_RECOVERY geldi: «adresin doğrulandı» denmez, açılışta lisansaBak çağrılmaz
  const sb = window.supabase.createClient(A.SUPABASE_URL, A.SUPABASE_ANON_KEY, { auth: { flowType: 'pkce' } });
  // DÖNÜŞ ADRESİ (G-0016 S4): doğrulama / yeniden gönderme / şifre sıfırlama bağlantıları her zaman sitenin KÖKÜNE döner
  // (bulunulan sayfa /index.html ya da ?ac=… değil). Canlıda köken yalnız https://cenkaltinay.com (www → 301 kök alan adı);
  // Auth «Redirect URLs» listesinde yalnız https://cenkaltinay.com/ kalır (uygulama-raporu G-0016).
  const DONUS_ADRESI = location.origin + '/';
  // AÇILIŞ PERDESİ (efekt.js) YALNIZ PROGRAM AÇILIRKEN: program arkada hazırlanır, perde ancak program
  // tamamen hazır olunca kalkar ('önce içerik, sonra animasyon, sonra yine içerik' olmasın).
  // Giriş ekranında perde YOK — Cenk: «asıl eklediğim arka planı görmek istiyorum».
  let PERDE = null, perdeKalkti = false;
  function perdeAc(){
    if (PERDE || !window.Efekt) return;
    PERDE = Efekt.perde(); perdeKalkti = false;
    // hiçbir durumda perdede asılı kalmasın — süre yalnız sekme görünürken işler
    (function emniyet(g, s){ const n = Date.now(); if (!document.hidden) g += n - s; if (g > 15000) perdeKaldir(); else if (!perdeKalkti) setTimeout(function(){ emniyet(g, n); }, 500); })(0, Date.now());
  }
  function perdeKaldir(cb){ if (!PERDE || perdeKalkti) { if (cb) cb(); return; } perdeKalkti = true; PERDE.bitir(cb); }
  let kip = 'giris', acik = false, sayac = null, kontrolde = false, ZAYIF_SIFRE = false;

  function mesaj(m, tur){ const e = $('mesaj'); e.textContent = m || ''; e.className = 'mesaj' + (m ? ' goster ' + (tur||'bilgi') : ''); }
  function goster(bolum){
    ['bolum_form','bolum_yeni','bolum_lisans','bolum_acik','bolum_mfa'].forEach(b => $(b).hidden = (b !== bolum));
    // G-0017: uyarı kutusu bölümlerin dışında (#mesaj altında) — giriş formundan çıkılınca gizlenir
    if (bolum !== 'bolum_form') dogrulamaKutusu(false);
    // Program açılırken perde vardı ve hata/uyarı çıktıysa perde kalksın (giriş ekranında perde yok)
    if (bolum !== 'bolum_lisans') perdeKaldir();
  }
  // Arka plan yalnız giriş ekranında: program ya da ana sayfa açılınca GPU'yu boşa yormasın
  function arkaPlan(acik){
    const c = $('kozmik-bg'), p = document.querySelector('.kozmik-perde');
    if (c) c.hidden = !acik; if (p) p.hidden = !acik;
    try { if (window.KozmikArkaPlan) acik ? KozmikArkaPlan.oynat() : KozmikArkaPlan.duraklat(); } catch (e) {}
  }
  // ŞİFRE KURALI (G-0014 §1.6; Supabase şifre politikası `uygula.mjs --panel`: en az 10, küçük + büyük harf + rakam).
  // Yalnız YENİ şifrelerde geçerli; eski şifreyle giriş sürer (Giriş sekmesinde minlength 8 kalır).
  const SIFRE_EN_AZ = 10;
  // G-0014 B3: kural yalnız İngilizce (ASCII) harfleri sayar — metin bunu açıkça söyler (Cenk 07.11.2026 onayı)
  const SIFRE_KURAL = 'En az 10 karakter; büyük harf, küçük harf ve rakam içermeli (İngilizce harflerle: A–Z, a–z; Ç, Ş, İ gibi harfler sayılmaz).';
  const SIFRE_HATA = 'Şifre en az 10 karakter olmalı ve büyük harf, küçük harf, rakam içermeli (İngilizce harflerle: A–Z, a–z; Ç, Ş, İ gibi harfler sayılmaz).';
  // Yeni şifre kuralı tarayıcıda da denetlenir: ekrandaki kural metni, panel ayarı (`--panel`) uygulanmadan önce de doğru olsun.
  // Karakter kümeleri Supabase password_required_characters ile aynı: a-z : A-Z : 0-9 (ASCII; ç/ş/ğ gibi harfler sayılmaz).
  // Kaynak: https://supabase.com/docs/guides/auth/password-security
  function sifreKuralHatasi(s){
    s = String(s || '');
    if (s.length < SIFRE_EN_AZ || !/[a-z]/.test(s) || !/[A-Z]/.test(s) || !/[0-9]/.test(s)) return SIFRE_HATA;
    return '';
  }
  // «Email not confirmed» → supabase-js hata kodu email_not_confirmed (Auth: doğrulanmamış hesap giriş yapamaz)
  const dogrulanmadiMi = e => /Email not confirmed/i.test((e && e.message) || '') || (e && e.code) === 'email_not_confirmed';
  // G-0017: doğrulama uyarı kutusu. E-posta maskeli gösterilir (ilk iki harf + ••• + @alan adı); adres bilinmiyorsa
  // (doğrulama bağlantısından hatalı dönüş) adresi yazıp yeniden istemesi söylenir. Yalnız textContent — HTML yorumlanmaz.
  function maskeliEposta(e){
    e = String(e || '').trim();
    const i = e.lastIndexOf('@');
    if (i < 1 || i === e.length - 1) return '';
    const yerel = e.slice(0, i);
    return yerel.slice(0, Math.max(1, Math.min(2, yerel.length - 1))) + '•••' + e.slice(i);
  }
  function dogrulamaKutusu(goster, eposta){
    $('dogrulama_kutusu').hidden = !goster;
    $('dogrulama_yeniden').hidden = !goster;
    if (!goster) return;
    const m = maskeliEposta(eposta);
    $('dogrulama_metin').textContent = m
      ? m + ' adresine doğrulama bağlantısı gönderdik.'
      : 'Kayıt olduğun e-posta adresini yukarıdaki kutuya yaz ve aşağıdaki düğmeyle yeni doğrulama bağlantısı iste.';
  }
  // G-0014 S7 (CWE-209; OWASP Error Handling Cheat Sheet): tanınmayan sunucu iletisi kullanıcıya HAM gösterilmez —
  // genel Türkçe ileti gösterilir, ayrıntı yalnız konsola yazılır (console.warn). Geçen kendi iletilerimiz:
  // trHata() ile atılanlar ve SQL fonksiyonlarımızın `raise exception` iletileri (PostgreSQL SQLSTATE P0001, Türkçe).
  const GENEL_HATA = 'Beklenmeyen bir hata oldu. Biraz sonra tekrar dene.';
  function trHata(m){ const e = new Error(m); e.turkce = true; return e; }
  function hataMetni(e){
    const m = (e && e.message) || String(e);
    if (e && e.turkce) return m;
    if (/Invalid login credentials/i.test(m)) return 'E-posta ya da şifre hatalı.';
    if (dogrulanmadiMi(e)) return 'E-posta adresin henüz doğrulanmadı. Gelen kutundaki bağlantıya tıkla; e-posta gelmediyse aşağıdan yeniden gönder.';
    if (/already registered/i.test(m)) return 'Bu e-posta ile zaten bir hesap var. Giriş yap.';
    if (/known to be weak|pwned/i.test(m)) return 'Bu şifre sızdırılmış şifre listelerinde var. Başka bir şifre seç.';
    // supabase/auth internal/api/password.go: MaxPasswordLength = 72 (bcrypt sınırı, bayt)
    if (/cannot be longer than/i.test(m)) return 'Şifre en çok 72 karakter olabilir (Türkçe harfler 2 karakter sayılır).';
    if (/Password should|weak_password|WeakPassword/i.test(m) || (e && e.code) === 'weak_password') return SIFRE_HATA;
    if ((e && e.code) === 'email_address_invalid' || /Unable to validate email|invalid format/i.test(m)) return 'E-posta adresi geçersiz görünüyor. Adresi kontrol et.';
    // Supabase aynı adrese 60 sn içinde ikinci e-postayı vermez: «For security purposes, you can only request this after N seconds.»
    const sn = m.match(/only request this after (\d+) seconds?/i);
    if (sn) return 'Güvenlik için ' + sn[1] + ' saniye sonra tekrar isteyebilirsin.';
    if (/rate limit/i.test(m)) return 'Çok sık denendi. Biraz bekleyip tekrar dene.';
    if (/captcha/i.test(m)) return 'Güvenlik doğrulaması geçilemedi. Sayfayı yenileyip tekrar dene.';
    if (/Auth session missing|session_not_found|JWT expired/i.test(m) || (e && e.code) === 'session_not_found') return 'Oturumun kapanmış. Çıkış yapıp yeniden giriş yap.';
    if (/Failed to fetch|NetworkError|Load failed|zaman aşımı/i.test(m)) return 'Sunucuya ulaşılamadı. İnternet bağlantını kontrol edip tekrar dene.';
    if (e && e.code === 'P0001' && m) return m;   // kendi SQL fonksiyonlarımızın Türkçe iletisi
    // kullanici-verisi.js iletileri (parantez içindeki ham ayrıntı gösterilmez)
    if (/^Bulut verin okunamadı/.test(m)) { console.warn('[hata ayrıntısı]', e); return 'Bulut verin okunamadı.'; }
    if (/^Buluttaki kayıt tanınmadı/.test(m)) return m;
    console.warn('[hata ayrıntısı]', e);
    return GENEL_HATA;
  }

  // --- giriş / kayıt sekmeleri
  document.querySelectorAll('.sekmeler button').forEach(b => b.addEventListener('click', () => {
    kip = b.dataset.kip;
    document.querySelectorAll('.sekmeler button').forEach(x => x.classList.toggle('aktif', x === b));
    const kayit = kip === 'kayit';
    $('kayit_alanlari').hidden = !kayit;
    $('baslik').textContent = kayit ? 'Hesap oluştur' : 'Giriş yap';
    // KAYIT ONAYI (G-0015, 06.11.2026, supabase/14-kayit-onayi.sql): kayıt olan e-postasını doğrular, hesap Cenk
    // onaylayınca açılır, 7 günlük demo onay günü başlar (eski «hemen açılır» akışı, 11-deneme.sql, artık geçerli değil)
    // 06.11.2026 — Cenk: «hesap oluşturma kısmındaki açıklamayı kaldır» → Kayıt ol sekmesinde açıklama satırı gizli
    $('aciklama').textContent = kayit ? '' : 'Lisanslı hesabınla devam et.';
    $('aciklama').hidden = kayit;
    $('gonder').textContent = kayit ? 'Kayıt ol' : 'Giriş yap';
    $('sifre').autocomplete = kayit ? 'new-password' : 'current-password';
    $('sifre').minLength = kayit ? SIFRE_EN_AZ : 8;   // yeni şifre kurala uyar; girişte eski şifreler geçer
    $('sifre_tekrar_alan').hidden = !kayit; $('sifre2').required = kayit;
    if (!kayit) $('sifre2').value = '';
    mesaj('');
    dogrulamaKutusu(false);   // G-0017: sekme değişiminde uyarı kutusu gizlenir
  }));

  // ROBOT KORUMASI (Cloudflare Turnstile, Managed): giriş / kayıt / şifre sıfırlama bir doğrulama belirteci
  // taşır; Supabase belirteci sunucuda doğrular (captcha zorunlu). Belirteç TEK KULLANIMLIK — her denemeden
  // sonra yenilenir. Kullanıcıların çoğu hiçbir şey görmez; şüpheli trafikte tek tıklık kutu çıkar.
  let captchaToken = null, captchaId = null;
  function captchaKur(){
    if (captchaId !== null || !A.TURNSTILE_SITE_KEY) return;
    if (!window.turnstile) { setTimeout(captchaKur, 200); return; }
    captchaId = turnstile.render('#captcha', { sitekey: A.TURNSTILE_SITE_KEY, theme: 'dark', size: 'flexible', language: 'tr',
      callback: function(t){ captchaToken = t; }, 'expired-callback': function(){ captchaToken = null; },
      'error-callback': function(){ captchaToken = null; } });
  }
  function captchaYenile(){ captchaToken = null; try { if (captchaId !== null) turnstile.reset(captchaId); } catch (e) {} }
  async function captchaBekle(){
    if (!A.TURNSTILE_SITE_KEY) return null;
    for (let i = 0; i < 50 && !captchaToken; i++) await new Promise(r => setTimeout(r, 200));
    if (!captchaToken) throw trHata('Güvenlik doğrulaması tamamlanmadı — kutucuğu işaretleyip tekrar dene.');
    return captchaToken;
  }
  captchaKur();

  $('form').addEventListener('submit', async ev => {
    ev.preventDefault();
    const eposta = $('eposta').value.trim(), sifre = $('sifre').value;
    if (kip === 'kayit' && sifreKuralHatasi(sifre)) { mesaj(sifreKuralHatasi(sifre), 'hata'); $('sifre').focus(); return; }
    if (kip === 'kayit' && sifre !== $('sifre2').value) { mesaj('İki şifre aynı değil. Şifreni iki kutuya da aynı yaz.', 'hata'); $('sifre2').focus(); return; }
    $('gonder').disabled = true; mesaj('');
    try {
      const captchaTokenSu = await captchaBekle();
      if (kip === 'kayit') {
        const { data, error } = await sb.auth.signUp({ email: eposta, password: sifre, options: {
          captchaToken: captchaTokenSu,
          data: { ad: $('ad').value.trim(), firma: $('firma').value.trim() },
          emailRedirectTo: DONUS_ADRESI } });
        if (error) throw error;
        // Confirm email AÇIK (G-0015): signUp oturum döndürmez; doğrulama bağlantısı siteye döner, supabase-js oturumu
        // URL'den kurar (SIGNED_IN → lisansaBak → onaysız hesapta «Onay bekleniyor»).
        // S16 (hesap numaralandırma): kayıtlı bir adresle yeniden kayıtta Supabase hata DÖNDÜRMEZ, data.user.identities
        // boş gelir — bu durumda da AYNI ileti gösterilir; «zaten hesap var» denmez.
        if (!data.session) {
          mesaj('Kayıt alındı. ' + eposta + ' adresine doğrulama bağlantısı gönderdik. Bağlantıya tıklayarak adresini doğrula; ' +
            'hesabın Cenk Altınay onayladığında açılır ve 7 günlük demo o gün başlar. E-posta gelmediyse gereksiz klasörüne bak ' +
            'ya da aşağıdan yeniden gönder. Hesabın zaten varsa giriş yap ya da «Şifremi unuttum»u kullan.', 'tamam');
          dogrulamaKutusu(true, eposta);   // G-0017 durum 1: kayıttan hemen sonra
        }
      } else {
        const { data, error } = await sb.auth.signInWithPassword({ email: eposta, password: sifre, options: { captchaToken: captchaTokenSu } });
        if (error) throw error;
        dogrulamaKutusu(false);   // G-0017: başarılı girişte gizlenir
        // §1.6: eski şifre yeni kurala uymuyorsa Supabase girişte weakPassword döndürür — giriş sürer, yalnız bilgi verilir
        if (data && data.weakPassword) ZAYIF_SIFRE = true;
      }
    } catch (e) {
      mesaj(hataMetni(e), 'hata');
      if (dogrulanmadiMi(e)) dogrulamaKutusu(true, eposta);   // G-0017 durum 2: «Email not confirmed» ile giriş
    }
    finally { $('gonder').disabled = false; captchaYenile(); }
  });

  // DOĞRULAMA E-POSTASINI YENİDEN GÖNDER (G-0014 §1.3). Supabase kayıtlı olmayan ya da zaten doğrulanmış adreste de
  // hata döndürmez (hesap numaralandırması yok); ileti her durumda aynıdır. Sıklık: aynı adrese 60 sn, proje saatte 30 e-posta.
  $('dogrulama_yeniden').addEventListener('click', async () => {
    const email = $('eposta').value.trim();
    if (!email) { mesaj('Önce e-posta adresini yaz.', 'hata'); $('eposta').focus(); return; }
    const b = $('dogrulama_yeniden'); b.disabled = true;
    try {
      const tk = await captchaBekle();
      const { error } = await sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: DONUS_ADRESI, captchaToken: tk } });
      if (error) throw error;
      mesaj('Doğrulama bağlantısı yeniden gönderildi. Gelen kutunu (ve gereksiz klasörünü) kontrol et.', 'tamam');
      dogrulamaKutusu(true, email);   // G-0017: kutudaki adres satırı gönderilen adrese güncellenir
    } catch (e) { mesaj(hataMetni(e), 'hata'); }
    finally { b.disabled = false; captchaYenile(); }
  });

  $('unuttum').addEventListener('click', async () => {
    const eposta = $('eposta').value.trim();
    if (!eposta) { mesaj('Önce e-posta adresini yaz.', 'hata'); $('eposta').focus(); return; }
    let tk; try { tk = await captchaBekle(); } catch (e) { mesaj(e.message, 'hata'); return; }
    const { error } = await sb.auth.resetPasswordForEmail(eposta, { redirectTo: DONUS_ADRESI, captchaToken: tk });
    captchaYenile();
    mesaj(error ? hataMetni(error) : 'Şifre sıfırlama bağlantısı e-postana gönderildi.', error ? 'hata' : 'tamam');
  });

  $('form_yeni').addEventListener('submit', async ev => {
    ev.preventDefault();
    if (sifreKuralHatasi($('yeni_sifre').value)) { mesaj(sifreKuralHatasi($('yeni_sifre').value), 'hata'); $('yeni_sifre').focus(); return; }
    if ($('yeni_sifre').value !== $('yeni_sifre2').value) { mesaj('İki şifre aynı değil. Yeni şifreni iki kutuya da aynı yaz.', 'hata'); $('yeni_sifre2').focus(); return; }
    const { error } = await sb.auth.updateUser({ password: $('yeni_sifre').value });
    if (error) return mesaj(hataMetni(error), 'hata');
    mesaj('Şifren değişti.', 'tamam');
    const { data } = await sb.auth.getSession();
    if (data.session) lisansaBak(data.session);
  });

  // Çıkış: oturum bu cihazınsa boşaltılır (öteki cihaz sonra uyarısız girebilsin)
  async function cikis(){
    if (window.EtkinlikKaydi) { EtkinlikKaydi.olay('Çıkış yaptı'); try { await EtkinlikKaydi.bitir(); } catch (e) {} }
    try { await sb.rpc('oturum_bitir'); } catch (e) {}
    await sb.auth.signOut({ scope: 'local' });
    location.reload();
  }
  $('cikis').addEventListener('click', cikis);
  $('menu_cikis').addEventListener('click', cikis);

  // ŞİFRE DEĞİŞTİR (06.11.2026): giriş yapmış kullanıcı yeni şifresini iki kez yazar; oturumla sb.auth.updateUser.
  // Oturum kapanmaz, öteki cihaz atılmaz. Supabase «güvenli şifre değişikliği» isterse (uzun süredir açık oturum)
  // kullanıcıya çıkıp yeniden girmesi ya da «Şifremi unuttum» kullanması söylenir.
  function sdMesaj(m, tur){ const e = $('sd_mesaj'); e.textContent = m || ''; e.className = 'mesaj' + (m ? ' goster ' + (tur || 'bilgi') : ''); }
  async function sifreAc(){
    const { data } = await sb.auth.getSession();
    if (!data.session) { mesaj('Şifre değiştirmek için önce giriş yap.', 'hata'); return; }
    const ep = data.session.user.email || '';
    $('sd_eposta').value = ep;
    $('sd_kim').textContent = (ep ? ep + ' hesabının şifresi. ' : '') + SIFRE_KURAL;
    $('sd_yeni').value = ''; $('sd_tekrar').value = ''; sdMesaj('');
    $('sd_gonder').disabled = false;
    $('sifre_modal').hidden = false; $('sd_yeni').focus();
  }
  function sifreKapat(){ $('sifre_modal').hidden = true; $('sd_yeni').value = ''; $('sd_tekrar').value = ''; }
  function sdHata(e){
    const m = (e && e.message) || String(e);
    if (/different from the old|same_password/i.test(m)) return 'Yeni şifre eskisiyle aynı olamaz.';
    if (/reauthenticat/i.test(m)) return 'Güvenlik için yeniden giriş gerekiyor: çıkış yapıp tekrar gir ya da giriş ekranındaki «Şifremi unuttum»u kullan.';
    if (/weak|pwned|known to be/i.test(m)) return 'Bu şifre çok zayıf ya da sızdırılmış listelerde var. Daha güçlü bir şifre seç.';
    return hataMetni(e);
  }
  ['ana_sifre', 'menu_sifre', 'lisans_sifre'].forEach(id => $(id).addEventListener('click', sifreAc));
  $('sd_kapat').addEventListener('click', sifreKapat);
  $('sifre_modal').addEventListener('click', e => { if (e.target === e.currentTarget) sifreKapat(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('sifre_modal').hidden) sifreKapat(); });
  $('sd_form').addEventListener('submit', async ev => {
    ev.preventDefault();
    const y = $('sd_yeni').value, t = $('sd_tekrar').value;
    if (sifreKuralHatasi(y)) { sdMesaj(sifreKuralHatasi(y), 'hata'); $('sd_yeni').focus(); return; }
    if (y !== t) { sdMesaj('İki şifre aynı değil.', 'hata'); $('sd_tekrar').focus(); return; }
    $('sd_gonder').disabled = true; sdMesaj('Kaydediliyor…');
    try {
      const { error } = await sb.auth.updateUser({ password: y });
      if (error) throw error;
      sdMesaj('Şifren değişti. Bir dahaki girişte yeni şifreni kullan.', 'tamam');
      $('sd_yeni').value = ''; $('sd_tekrar').value = '';
      if (window.EtkinlikKaydi) try { EtkinlikKaydi.olay('Şifre değiştirdi'); } catch (e) {}
      setTimeout(sifreKapat, 2200);
    } catch (e) { sdMesaj(sdHata(e), 'hata'); }
    finally { $('sd_gonder').disabled = false; }
  });
  $('yenile').addEventListener('click', async () => { const { data } = await sb.auth.getSession(); if (data.session) lisansaBak(data.session); });

  // --- lisans kontrolü ve programın yüklenmesi
  async function durumSor(){
    const { data, error } = await sb.rpc('lisans_durumu');
    if (error) throw error;
    return data;
  }

  async function lisansaBak(oturum){
    // KAREKODLA GİRİŞ (12.11.2026): telefonda ?qr= adresi → lisans / tek oturum akışı yerine onay ekranı (qr-giris.js)
    if (window.QrGiris && QrGiris.yakala(oturum)) return;
    if (kontrolde || acik) return;
    kontrolde = true;
    try { await lisansaBakGovde(oturum); } finally { kontrolde = false; }
  }

  // İKİ ADIMLI DOĞRULAMA ADIMI (G-0014 §4.2). Yalnız doğrulanmış TOTP faktörü olan hesapta (aal1 → aal2) kod sorulur;
  // faktörü olmayan hesap (currentLevel = nextLevel = aal1) ve AAL okunamazsa akış AYNEN sürer — kimse kilitlenmez.
  // Asıl kapı sunucuda: taslak 05 (yonetici_mi aal2 ister). Kaynak: https://supabase.com/docs/guides/auth/auth-mfa/totp
  async function mfaGerekli(){
    try {
      const { data, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      return !error && !!data && data.currentLevel === 'aal1' && data.nextLevel === 'aal2';
    } catch (e) { return false; }
  }
  $('form_mfa').addEventListener('submit', async ev => {
    ev.preventDefault();
    const code = $('mfa_kod').value.trim();
    if (!/^\d{6}$/.test(code)) { mesaj('Doğrulama uygulamandaki 6 haneli kodu yaz.', 'hata'); $('mfa_kod').focus(); return; }
    $('mfa_gonder').disabled = true; mesaj('');
    try {
      const { data: f, error: fh } = await sb.auth.mfa.listFactors();
      if (fh) throw fh;
      const totp = (f && f.totp) || [];   // listFactors().totp yalnız doğrulanmış faktörleri içerir
      if (!totp.length) throw new Error('faktör yok');
      const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: totp[0].id, code });
      if (error) throw error;
      $('mfa_kod').value = '';
      const { data } = await sb.auth.getSession();
      if (data.session) lisansaBak(data.session);
    } catch (e) { mesaj('Kod hatalı ya da süresi geçti.', 'hata'); $('mfa_kod').select(); }
    finally { $('mfa_gonder').disabled = false; }
  });
  $('mfa_cikis').addEventListener('click', cikis);

  // §1.6 bilgi şeridi: giriş, program ve ana sayfanın üstünde görünür; tıklayınca ya da 20 sn sonra kapanır
  const ZAYIF_METIN = 'Şifren yeni kurallara uymuyor; menüden Şifre değiştir ile yenileyebilirsin.';
  function zayifSifreBilgisi(){
    ZAYIF_SIFRE = false;
    const s = $('serit');
    s.textContent = ZAYIF_METIN; s.hidden = false; s.style.cursor = 'pointer';
    s.onclick = function(){ if (s.textContent === ZAYIF_METIN) s.hidden = true; };
    setTimeout(function(){ if (s.textContent === ZAYIF_METIN) s.hidden = true; }, 20000);
  }

  async function lisansaBakGovde(oturum){
    if (await mfaGerekli()) {
      goster('bolum_mfa'); mesaj(''); perdeKaldir();
      setTimeout(() => $('mfa_kod').focus(), 0);
      return;
    }
    goster('bolum_lisans'); mesaj('');
    // §1.6: eski şifre yeni kurala uymuyor (girişte weakPassword) — yalnız bilgi
    if (ZAYIF_SIFRE) zayifSifreBilgisi();
    $('kim').textContent = oturum.user.email;
    BASVURU_UID = oturum.user.id; BASVURU_EPOSTA = oturum.user.email || '';
    $('yenile').hidden = true; $('basvuru_ac').hidden = true;
    $('lisans_baslik').textContent = 'Lisans kontrol ediliyor…';
    $('lisans_metin').textContent = '';
    let d;
    // rpc tembeldir: then() bağlanmazsa istek HİÇ gitmez
    try { sb.rpc('giris_kaydet').then(function(){}, function(){}); d = await durumSor(); }
    catch (e) { $('lisans_baslik').textContent = 'Bağlantı hatası'; mesaj(hataMetni(e), 'hata'); $('yenile').hidden = false; perdeKaldir(); return; }
    $('yonetim_bag').hidden = !d.yonetici;
    $('menu_yonetim').hidden = !d.yonetici;

    if (!d.gecerli) {
      if (d.aktif && d.bitis && d.demo) {
        $('lisans_baslik').textContent = 'Deneme süresi doldu';
        $('lisans_metin').textContent = 'Demo deneme süren ' + trTarih(d.bitis) + ' tarihinde sona erdi. Lisans için Cenk Altınay ile iletişime geç.';
      } else if (d.aktif && d.bitis) {
        $('lisans_baslik').textContent = 'Lisans süresi doldu';
        $('lisans_metin').textContent = 'Lisansın ' + trTarih(d.bitis) + ' tarihinde sona erdi. Yenilemek için Cenk Altınay ile iletişime geç.';
      } else {
        $('lisans_baslik').textContent = 'Onay bekleniyor';
        $('lisans_metin').textContent = (dogrulamaDonusu && !kurtarmaDonusu ? 'E-posta adresin doğrulandı. ' : '') +
          'Hesabın oluşturuldu, lisansın henüz etkinleştirilmedi. Onaylandığında bu sayfayı yenilemen yeterli.';
      }
      $('basvuru_ac').hidden = false;
      $('yenile').hidden = false; perdeKaldir();
      return;
    }

    // TEK OTURUM (yönetici muaf): hesap başka bir cihazda CANLIYSA önce uyar, açma.
    // "Yine de burada aç" (OTURUM_ZORLA) → bu cihaz aktif olur, eskisi Realtime ile ANINDA kapanır.
    if (!d.yonetici) {
      let od = null;
      try { const r = await sb.rpc('oturum_durumu'); od = r.data; } catch (e) {}
      if (od && od.baska_acik && !OTURUM_ZORLA) { acikUyarisi(od); return; }
      try {
        await sb.rpc('oturum_baslat', { cihaz: navigator.userAgent });
        // karekodla girişte onaylayan telefonun oturumu düşürülmez (bir dahaki karekod için girişli kalsın); etkin cihaz yine bu
        if (!(window.QrGiris && QrGiris.qrIleGirildi()))
          sb.auth.signOut({ scope: 'others' }).then(function(){}, function(){});   // öteki cihazların yenileme belirteçleri düşer
      } catch (e) {}
      oturumIzle(oturum);
    }

    const prm = new URLSearchParams(location.search);
    // Görebildiği programlar: yönetici hepsini, kullanıcı yönetimde açılanları (d.programlar).
    // Asıl kapı depo kuralıdır (dosya_izni); bu süzgeç yalnız ekranda olmayanı göstermemek için.
    const izinli = d.yonetici ? A.PROGRAMLAR : A.PROGRAMLAR.filter(p => (d.programlar || []).indexOf(p.id) >= 0);
    if (!izinli.length) {
      $('lisans_baslik').textContent = 'Program atanmadı';
      $('lisans_metin').textContent = 'Lisansın geçerli ama henüz sana bir program açılmadı. Cenk Altınay ile iletişime geç.';
      $('yenile').hidden = false; perdeKaldir();
      return;
    }
    const secilen = izinli.find(p => p.id === prm.get('ac'));
    // Ana sayfa: yöneticide her zaman, kullanıcıda birden çok programı varsa (?ac= yoksa)
    if (!secilen && (d.yonetici || izinli.length > 1)) {
      if (window.EtkinlikKaydi) EtkinlikKaydi.baslat({ sb, program: null });   // ETKİNLİK KAYDI: ana sayfa ziyareti
      anaSayfa(oturum, d, izinli); return;
    }

    const program = secilen || izinli[0];
    $('menu_ana').hidden = !(d.yonetici || izinli.length > 1);
    ANTET_AD = d.ad || '';
    DEMO = !!d.demo && !d.yonetici;
    $('menu_basvuru').hidden = !DEMO;
    // tam lisans ?surum=sade ile sade sürümü de açabilir
    const surum = (d.surum === 'tam' && prm.get('surum') !== 'sade') ? 'tam' : 'sade';
    let dosyaAdi = program.dosyalar[surum] || program.dosyalar.tam || program.dosyalar.sade || Object.values(program.dosyalar)[0];
    // Yönetici ?deneme=ince ile yeni sürümü canlıya almadan dener (depo bu adları yalnız yöneticiye verir)
    if (d.yonetici && prm.get('deneme') === 'ince' && program.id === 'ahu') dosyaAdi = dosyaAdi.replace(/\.html$/, '-ince.html');
    $('lisans_baslik').textContent = 'Hoş geldin';
    $('lisans_metin').textContent = d.bitis ? (DEMO ? 'Demo deneme · son gün: ' : 'Lisans bitişi: ') + trTarih(d.bitis) : 'Süresiz lisans';
    $('yukleniyor').hidden = false;
    perdeAc();   // program iniyor: perde şimdi iner, program hazır olunca kalkar
    // KULLANICI VERİSİ (kullanici-verisi.js): program açılmadan ÖNCE kullanıcının ad alanı hazırlanır
    // (gerekirse buluttan geri kurulur); program HTML'ine ad alanı katmanı gömülür. AHU Studio kapsam dışı.
    const veriVar = !!window.KullaniciVerisi && KullaniciVerisi.KAPSAM_DISI.indexOf(program.id) < 0;
    try {
      const veriSozu = veriVar ? KullaniciVerisi.hazirla({ sb, uid: oturum.user.id, programId: program.id, yonetici: !!d.yonetici, gosterge: $('menu_bulut') }) : null;
      if (veriSozu) veriSozu.catch(function(){});
      const aciciSozu = programAcici();   // G-0016: program açıcı, dosya inerken paralel yüklenir
      aciciSozu.catch(function(){});
      const blob = await programIndir(dosyaAdi);
      // Programlar kovada SIKIŞTIRILMIŞ (gzip) saklanır (13.10.2026, kota: indirme ~4–5 kat küçük); adı aynı kalır,
      // ilk iki bayt 1f 8b ise burada çözülür. Sıkıştırılmamış eski dosya da açılır.
      const bas = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
      let metin = (bas[0] === 0x1f && bas[1] === 0x8b)
        ? await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text()
        : await blob.text();
      if (veriSozu) {
        try { await veriSozu; } catch (e) { throw trHata('Verilerin hazırlanamadı: ' + hataMetni(e)); }
        metin = KullaniciVerisi.gom(metin);
      }
      const acici = await aciciSozu;
      const f = $('uygulama');
      // SANTRAL KÜTÜPHANESİ (kutuphane.js): AHU Studio'nun f0'ı açılırken el sıkışır; kurulum programdan ÖNCE
      if (program.id === 'ahu' && window.Kutuphane) Kutuphane.kur({ sb, uid: oturum.user.id, yonetici: !!d.yonetici, adminKod: !!(d.yonetici || d.admin_kod), cerceve: f });
      f.onload = function(){ programYuklendi(); programHazir(function(){ perdeKaldir(); }); };
      // G-0016 (CSP): blob adresini ve gezinmeyi program-acici.html yapar → program bu sayfanın sıkı CSP'sini devralmaz
      // (blob belge CSP'yi gezinmeyi başlatandan alır). Önceki hâli: f.src = URL.createObjectURL(new Blob([metin], …)).
      acici.programAc(f, metin);
      f.hidden = false;
      $('giris_sahne').hidden = true; arkaPlan(false);
      $('menu').hidden = false;
      document.title = program.ad;
      sekmeSimgesi(program);
      f.title = program.ad;
      acik = true;
      if (window.EtkinlikKaydi) EtkinlikKaydi.baslat({ sb, program: program.id + (surum === 'sade' && program.dosyalar.sade ? ':sade' : '') });
      donemselKontrol();
    } catch (e) {
      $('yukleniyor').hidden = true;
      $('lisans_baslik').textContent = 'Program yüklenemedi';
      const veriHatasi = /^Verilerin hazırlanamadı/.test((e && e.message) || '');
      const aciciHatasi = (e && e.message) === ACICI_HATA;
      mesaj(veriHatasi ? hataMetni(e) + ' Program, buluttaki verinin üzerine yazmasın diye açılmadı — Tekrar dene.'
        : aciciHatasi ? ACICI_HATA
        : 'Program dosyası alınamadı: ' + hataMetni(e) + (d.yonetici ? ' — Yönetim sayfasından programı yüklediğinden emin ol.' : ''), 'hata');
      $('yenile').hidden = false; perdeKaldir();
    }
  }

  // PROGRAM AÇICI (G-0016, S11). Bu sayfanın CSP'si satır içi betiğe izin vermez; blob belge CSP'yi gezinmeyi başlatan
  // belgeden devralır (HTML Living Standard «determining navigation params policy container», adım 3: yerel şemalı adreste
  // başlatıcının politika kabı). Programlar (satır içi betikli tek dosya HTML) bu yüzden CSP'siz, aynı kökenli, gizli
  // program-acici.html üzerinden açılır: blob'u o oluşturur ve #uygulama'yı o gezdirir. Bir kez kurulur, sayfa boyunca
  // yaşar (blob adresi ancak oluşturan belge yaşadıkça geçerli; program kendini yeniden yüklerse de açılır).
  const ACICI_HATA = 'Program açıcı yüklenemedi. Sayfayı yenileyip tekrar dene.';
  let ACICI = null;
  function programAcici(){
    if (ACICI) return ACICI;
    ACICI = new Promise(function(coz, red){
      const y = document.createElement('iframe');
      y.id = 'program_acici'; y.hidden = true; y.title = 'Program açıcı'; y.tabIndex = -1; y.setAttribute('aria-hidden', 'true');
      const bitir = function(w){
        clearTimeout(sure);
        if (w) return coz(w);
        y.remove(); ACICI = null; red(trHata(ACICI_HATA));
      };
      const sure = setTimeout(function(){ bitir(null); }, 20000);
      y.onload = function(){
        let w = null;
        try { if (typeof y.contentWindow.programAc === 'function') w = y.contentWindow; } catch (e) {}
        bitir(w);
      };
      y.src = 'program-acici.html?v=20261108a';
      document.body.appendChild(y);
    });
    return ACICI;
  }

  // Program dosyası ÖNBELLEKSİZ iner (14.10.2026). Kovadaki bazı dosyalar geçersiz bir önbellek başlığı
  // ('cache-control: public, 0') taşıyordu; tarayıcı onu yok sayıp dosyayı yaşına göre saatlerce taze
  // saydı ve güncellemeden sonra ESKİ programı açtı — sunucu eski damgaya 409 verdi, arayüz yarım kaldı.
  // cache: 'no-store' tarayıcı önbelleğine hiç bakmaz, her açılışta kovadaki güncel dosya gelir.
  async function programIndir(dosyaAdi){
    const { data } = await sb.auth.getSession();
    const belirtec = data.session ? data.session.access_token : A.SUPABASE_ANON_KEY;
    const yol = dosyaAdi.split('/').map(encodeURIComponent).join('/');
    const r = await fetch(A.SUPABASE_URL + '/storage/v1/object/' + A.KOVA + '/' + yol, {
      headers: { apikey: A.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + belirtec }, cache: 'no-store' });
    if (!r.ok) {
      let m = '';
      try { const j = await r.json(); m = j.message || j.error || ''; } catch (e) {}
      // G-0014 S7: depo iletisi (ör. «Object not found») yalnız konsola; kullanıcıya durum koduyla Türkçe ileti
      console.warn('[program dosyası]', r.status, m);
      throw trHata((r.status === 400 || r.status === 404 ? 'dosya bulunamadı ya da erişim iznin yok' : r.status === 401 || r.status === 403 ? 'erişim iznin yok' : 'sunucu yanıt vermedi') + ' (HTTP ' + r.status + ').');
    }
    return r.blob();
  }

  // ---------------- LİSANS BAŞVURUSU (23.10.2026) ----------------
  // Demo / süresi dolmuş kullanıcı formu doldurur → lisans_basvur() (oturum şart, 10 dk'da bir) →
  // tetikleyici yöneticiye e-posta yollar. Ad / firma hesaptan önceden doldurulur.
  // E-POSTA DOĞRULAMASI (13-eposta-dogrulama.sql, 17-kayit-dogrulama-ve-eposta-kodu.sql): 06.11.2026'dan sonra
  // kayıt olan hesap doğrulama bağlantısıyla doğrulanmış gelir, kod istenmez. 23.10–06.11 arasında doğrulamasız
  // açılmış eski hesap başvururken «Kod gönder» → e-postasına gelen 6 haneli kodu yazar (bir kez; sonra doğrulanmış).
  let BASVURU_UID = null, BASVURU_EPOSTA = '', BV_DOGRULANDI = true, kodSayac = null;
  function bvDogrulamaGoster(){
    $('bv_dogrula').hidden = BV_DOGRULANDI;
    $('bv_dogrula_metin').textContent = 'Başvurunun sana ulaşabilmesi için ' + BASVURU_EPOSTA +
      ' adresini doğrula: «Kod gönder»e bas, e-postana gelen kodu yaz (gereksiz klasörüne de bak).';
  }
  async function basvuruAc(){
    const m = $('basvuru_modal');
    $('bv_mesaj').className = 'mesaj'; $('bv_gonder').disabled = false;
    $('bv_aciklama').textContent = 'Bilgilerini bırak, Cenk Altınay seninle iletişime geçsin.' + (DEMO ? ' Demo hesabın bu sırada açık kalır.' : '');
    m.hidden = false; $('bv_ad').focus();
    try {
      const [h, s] = await Promise.all([
        sb.from('lisanslar').select('ad,firma').eq('user_id', BASVURU_UID).maybeSingle(),
        sb.rpc('basvuru_durumum')]);
      if (h.data) { if (!$('bv_ad').value) $('bv_ad').value = h.data.ad || ''; if (!$('bv_firma').value) $('bv_firma').value = h.data.firma || ''; }
      if (s.data) {
        BV_DOGRULANDI = !!s.data.dogrulandi; bvDogrulamaGoster();
        if (s.data.son) bvMesaj('Son başvurun ' + new Date(s.data.son).toLocaleDateString('tr-TR') + ' tarihinde alındı. Yeni bilgi eklemek istersen yeniden gönderebilirsin.', 'bilgi');
      }
    } catch (e) {}
  }
  $('bv_kod_gonder').addEventListener('click', async () => {
    const b = $('bv_kod_gonder'); b.disabled = true;
    const { data, error } = await sb.rpc('eposta_kodu_gonder');
    if (error) { bvMesaj(hataMetni(error), 'hata'); b.disabled = false; return; }
    if (data === 'zaten') { BV_DOGRULANDI = true; bvDogrulamaGoster(); bvMesaj('E-posta adresin zaten doğrulanmış.', 'tamam'); return; }
    bvMesaj('Kod ' + BASVURU_EPOSTA + ' adresine gönderildi. 15 dakika geçerli.', 'bilgi');
    $('bv_kod').focus();
    // aynı dakika içinde yeniden istenmesin (sunucu da reddeder)
    let k = 60; b.textContent = 'Tekrar (' + k + ')';
    clearInterval(kodSayac);
    kodSayac = setInterval(() => { k--; if (k > 0) { b.textContent = 'Tekrar (' + k + ')'; return; }
      clearInterval(kodSayac); b.textContent = 'Kodu yeniden gönder'; b.disabled = false; }, 1000);
  });
  function bvMesaj(m, tur){ const e = $('bv_mesaj'); e.textContent = m; e.className = 'mesaj goster ' + tur; }
  function basvuruKapat(){ $('basvuru_modal').hidden = true; }
  $('basvuru_ac').addEventListener('click', basvuruAc);
  $('menu_basvuru').addEventListener('click', basvuruAc);
  $('bv_kapat').addEventListener('click', basvuruKapat);
  $('basvuru_modal').addEventListener('click', e => { if (e.target === e.currentTarget) basvuruKapat(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('basvuru_modal').hidden) basvuruKapat(); });
  $('bv_form').addEventListener('submit', async ev => {
    ev.preventDefault();
    if (!BV_DOGRULANDI && !/^\d{6}$/.test($('bv_kod').value.trim())) {
      bvMesaj('Önce e-posta adresini doğrula: «Kod gönder»e bas, gelen 6 haneli kodu yaz.', 'hata'); $('bv_kod').focus(); return;
    }
    $('bv_gonder').disabled = true;
    const { data, error } = await sb.rpc('lisans_basvur', { ad: $('bv_ad').value, firma: $('bv_firma').value,
      telefon: $('bv_tel').value, surum: $('bv_surum').value, mesaj: $('bv_not').value,
      kod: BV_DOGRULANDI ? null : $('bv_kod').value.trim() });
    if (error) { bvMesaj(hataMetni(error), 'hata'); $('bv_gonder').disabled = false; return; }
    if (data && data.hata) {
      if (data.hata === 'dogrulama') { BV_DOGRULANDI = false; bvDogrulamaGoster(); }
      bvMesaj(data.mesaj, 'hata'); $('bv_gonder').disabled = false; return;
    }
    BV_DOGRULANDI = true; bvDogrulamaGoster(); $('bv_kod').value = '';
    if (window.EtkinlikKaydi) EtkinlikKaydi.olay('Lisans başvurusu gönderdi');
    bvMesaj('Başvurun alındı. Cenk Altınay en kısa sürede seninle iletişime geçecek.', 'tamam');
    $('bv_not').value = '';
    setTimeout(basvuruKapat, 3500);
  });

  // Açıkken lisans arada bir yeniden sorulur. Süresi dolarsa ÇALIŞMA KESİLMEZ
  // (kaydedilmemiş proje kaybolmasın) — uyarı çıkar, sonraki girişte açılmaz.
  function donemselKontrol(){
    clearInterval(sayac);
    sayac = setInterval(async () => {
      try {
        const d = await durumSor();
        if (!d.gecerli) { $('serit').textContent = 'Lisansın artık geçerli değil. Projeni kaydet; program bir sonraki girişte açılmayacak.'; $('serit').hidden = false; }
      } catch (e) { /* bağlantı yoksa sessiz geç */ }
    }, (A.LISANS_KONTROL_DK || 30) * 60000);
  }

  // ---------------- TEK OTURUM ----------------
  // Asıl kapı veritabanındadır (depo kuralı + sunucu çekirdeği aktif oturumu şart koşar);
  // buradaki akış kullanıcıya ne olduğunu söyler.
  let OTURUM_ZORLA = false, nabizSayac = null, kanal = null, kapandi = false;

  // Erişim belirtecindeki session_id (bu cihazın oturum kimliği)
  function oturumKimligi(oturum){
    try { return JSON.parse(atob(oturum.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).session_id || ''; }
    catch (e) { return ''; }
  }
  function cihazAdi(ua){
    ua = ua || '';
    const os = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'bir cihaz';
    const tb = /OPR\//.test(ua) ? 'Opera' : /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
    return tb ? tb + ' · ' + os : os;
  }

  // İkinci cihaz: uyar, açma
  function acikUyarisi(od){
    goster('bolum_acik');
    const saat = od.zaman ? new Date(od.zaman).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '';
    $('acik_metin').textContent = 'Bu hesap şu an ' + cihazAdi(od.cihaz) + ' üzerinde açık' + (saat ? ' (son etkinlik ' + saat + ')' : '') +
      '. Bir hesap aynı anda tek cihazda kullanılabilir. Burada açarsan oradaki program hemen kapanır.';
  }
  $('acik_ac').addEventListener('click', async () => {
    OTURUM_ZORLA = true;
    const { data } = await sb.auth.getSession();
    if (data.session) lisansaBak(data.session);
  });
  $('acik_vazgec').addEventListener('click', async () => { await sb.auth.signOut({ scope: 'local' }); location.reload(); });

  // Aktif cihaz: Realtime ile ANINDA, yedek olarak 30 sn'de bir nabızla izlenir
  function oturumIzle(oturum){
    const sid = oturumKimligi(oturum);
    clearInterval(nabizSayac);
    nabizSayac = setInterval(async () => {
      try { const { data, error } = await sb.rpc('oturum_nabiz'); if (!error && data === false) oturumKapandi(); } catch (e) {}
    }, 30000);
    try {
      if (kanal) sb.removeChannel(kanal);
      kanal = sb.channel('oturum-' + oturum.user.id)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'lisanslar', filter: 'user_id=eq.' + oturum.user.id },
          p => { if (p.new && sid && String(p.new.aktif_oturum || '') !== sid) oturumKapandi(); })
        .subscribe();
    } catch (e) {}
  }

  // Bu cihazın oturumu devralındı: program KAPATILIR, perde iner
  function oturumKapandi(){
    if (kapandi) return;
    kapandi = true; acik = false;
    if (window.EtkinlikKaydi) { EtkinlikKaydi.olay('Oturum başka cihazda açıldı — program kapandı'); EtkinlikKaydi.bitir(); }
    clearInterval(nabizSayac); clearInterval(sayac);
    const f = $('uygulama'); f.onload = null; f.src = 'about:blank'; f.hidden = true;
    if (window.Kutuphane) Kutuphane.kapat();
    $('menu').hidden = true; $('ana_sayfa').hidden = true; $('giris_sahne').hidden = true; arkaPlan(true);
    $('oturum_perde').hidden = false;
  }
  $('oturum_yeniden').addEventListener('click', () => location.reload());
  $('oturum_cikis').addEventListener('click', async () => { await sb.auth.signOut({ scope: 'local' }); location.reload(); });

  // Program yüklenince (aynı köken: blob, program-acici.html açtı — G-0016):
  //  · ANTET: AHU Studio'nun Excel antetindeki ÇİZEN hücresi kabuğun AHU_CIZEN'ini okur
  //    (eskiden şifre kapısı yazıyordu) → kullanıcının Ad Soyad'ı.
  //  · ANA SAYFA bağlantıları: programların kendi "Ana sayfa" düğmesi göreli adrese gider;
  //    blob belgede göreli adres çözülmez (düğme geçersiz kalıyordu) → burada yakalanır.
  let ANTET_AD = '';
  // DEMO HESAP (09.10.2026, Cenk: «tuşlar dursun ama çalışmasın — indirmek ile ilgili olanlar»): programın
  // bütün çerçevelerinde dosya indirme (a[download] tıklaması) durdurulur, yerine bildirim çıkar. Asıl kapı
  // SUNUCUDADIR (çekirdek demo lisansa dosya üreten isteği 403 'demo' ile reddeder); bu katman yalnız
  // tarayıcıda üretilen dosyaları (proje kaydı, Profil Listesi, Sac Yerleşim …) da kapsar.
  let DEMO = false;
  const DEMO_MESAJ = 'Demo hesapta dosya indirme kapalı.';
  let demoSayac = null;
  window.ahuDemoUyari = function(){ demoUyari(); };   // bekleme.js sunucunun 403 demo yanıtında çağırır
  function demoUyari(){
    let t = $('demo_uyari');
    if (!t) {
      // Ekranın ORTASINDA, göze gelen kart (Cenk: «demo uyarısı ekranın ortasında göze gelsin»); tıklayınca kapanır
      t = document.createElement('div'); t.id = 'demo_uyari'; t.setAttribute('role', 'alertdialog');
      t.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(4,6,12,.55);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);cursor:pointer';
      t.innerHTML = '<div style="max-width:420px;margin:16px;padding:26px 30px;border-radius:14px;background:#141a26;border:1px solid #f0b445;box-shadow:0 0 0 4px rgba(240,180,69,.15),0 24px 70px rgba(0,0,0,.55);text-align:center;color:#fff;font:400 14px/1.5 Inter,system-ui,sans-serif">' +
        '<div style="width:46px;height:46px;margin:0 auto 12px;border-radius:50%;background:rgba(240,180,69,.15);color:#f0b445;font:700 26px/46px Inter,system-ui,sans-serif">!</div>' +
        '<div style="font-weight:600;font-size:18px;margin-bottom:6px">Demo hesap</div>' +
        '<div id="demo_uyari_metin" style="color:#c8d2e6"></div>' +
        '<div style="margin-top:14px;font-size:12px;color:#8a96ad">Tam kullanım için: cenk.altinay' + String.fromCharCode(64) + 'gmail.com</div></div>';
      t.addEventListener('click', () => { t.style.display = 'none'; });
      document.body.appendChild(t);
    }
    $('demo_uyari_metin').textContent = DEMO_MESAJ + ' Arayüzü dilediğiniz gibi deneyebilirsiniz. Lisans için sağ alttaki «Lisans başvurusu».'; t.style.display = 'flex';
    clearTimeout(demoSayac); demoSayac = setTimeout(() => { t.style.display = 'none'; }, 4500);
  }
  function demoKur(w){
    try {
      if (!w || w.__demoKuruldu) return;
      w.__demoKuruldu = true;
      w.AHU_DEMO = true;
      const P = w.HTMLAnchorElement && w.HTMLAnchorElement.prototype;
      const indirme = a => a && (a.hasAttribute('download') || /^(blob|data):/i.test(a.getAttribute('href') || ''));
      if (P) {
        const tikla = P.click, gonder = P.dispatchEvent;
        P.click = function(){ if (indirme(this)) { demoUyari(); return; } return tikla.apply(this, arguments); };
        P.dispatchEvent = function(e){ if (e && e.type === 'click' && indirme(this)) { demoUyari(); return false; } return gonder.apply(this, arguments); };
      }
      w.document.addEventListener('click', e => {
        const a = e.target && e.target.closest ? e.target.closest('a') : null;
        if (indirme(a)) { e.preventDefault(); e.stopPropagation(); demoUyari(); }
      }, true);
      w.document.querySelectorAll('iframe').forEach(fr => {
        const kur = () => { try { demoKur(fr.contentWindow); } catch (e) {} };
        kur();
        fr.addEventListener('load', kur);
      });
    } catch (e) {}
  }
  function programYuklendi(){
    const f = $('uygulama');
    try { f.contentWindow.AHU_CIZEN = ANTET_AD; } catch (e) {}
    if (DEMO) demoKur(f.contentWindow);
    if (window.EtkinlikKaydi) EtkinlikKaydi.cerceve(f.contentWindow);
    try {
      f.contentDocument.addEventListener('click', function(e){
        const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
        if (!a) return;
        const h = a.getAttribute('href');
        const kok = location.origin + location.pathname.replace(/[^/]*$/, '');
        if (h === '/' || h === './' || h === 'index.html' || a.id === 'hm-ev') {
          e.preventDefault(); e.stopPropagation();
          location.href = kok;
          return;
        }
        // Programlar arası bağlantı (ör. Lazer ERP ↔ Atölye Hesap Araçları): dosya adı → ?ac=<id>.
        // Erişimi olmayan program yine depo kuralında durur; yükleyici kullanıcının kendi programına düşer.
        const ad = (h || '').split(/[?#]/)[0].split('/').pop();
        const hedef = ad && A.PROGRAMLAR.find(p => Object.values(p.dosyalar).some(f => f.split('/').pop().replace(/\.gz$/, '') === ad));
        if (hedef) {
          e.preventDefault(); e.stopPropagation();
          const url = kok + '?ac=' + encodeURIComponent(hedef.id);
          if (a.target === '_blank') window.open(url, '_blank', 'noopener'); else location.href = url;
        }
      }, true);
    } catch (e) {}
  }

  // Program HAZIR mı: AHU Studio'da 3B Tasarım (f0) kendi açılış perdesini oynatır; site perdesi
  // zaten oynadığı için onu görünmeden KISA KESERİZ (f0'ın kendi 'tuşa basınca kapan' yolu) ve
  // f0 perdesi kalkınca site perdesini kaldırırız. Başka programda kabuk yüklenince hazırdır.
  function programHazir(cb){
    // Süre YALNIZ sekme görünürken sayılır: arka plan sekmesinde tarayıcı animasyon karelerini
    // dondurur, f0 perdesi ancak sekme öne gelince oynar — o zamana dek site perdesi kalkmamalı.
    const f = $('uygulama'); let gorunur = 0, son = Date.now();
    (function bak(){
      let hazir = false;
      try {
        const kab = f.contentDocument, f0 = kab && kab.getElementById('f0');
        if (!f0) hazir = !!kab && kab.readyState === 'complete';
        else {
          const d0 = f0.contentDocument, w0 = f0.contentWindow;
          if (d0 && d0.readyState === 'complete' && d0.body && d0.body.children.length) {
            const sp = d0.getElementById('tema-splash');
            if (!sp) hazir = true;
            else if (sp.classList.contains('oyna')) w0.dispatchEvent(new Event('keydown'));
          }
        }
      } catch (e) { hazir = true; }
      const simdi = Date.now(); if (!document.hidden) gorunur += simdi - son; son = simdi;
      if (hazir || gorunur > 9000) cb(); else setTimeout(bak, 80);
    })();
  }

  // Ana sayfa: her program bir kart. Yönetici hepsini + tam/sade seçimini + yönetimi görür;
  // kullanıcı yalnız kendisine açılan programları (AHU'da kendi sürümü, tek düğme).
  function anaSayfa(oturum, d, izinli){
    if (!d.yonetici) {
      document.querySelectorAll('#ana_sayfa .ana-baslik')[1].hidden = true;
      document.querySelectorAll('#ana_sayfa .kartlar')[1].hidden = true;
      document.querySelector('#ana_sayfa .marka .alt').textContent = '· Programlarım';
    }
    // Ana sayfa da giriş ekranının arka planını taşır (Cenk, 08.10.2026)
    $('giris_sahne').hidden = true; arkaPlan(true);
    $('ana_sayfa').hidden = false;
    $('ana_kim').textContent = oturum.user.email;
    perdeKaldir(function(){ if (window.Efekt) Efekt.giris('#ana_sayfa .pkart'); });
    document.title = 'ALTINAY · Ana sayfa';
    const kac = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    // Kartın TAMAMI tıklanır (Cenk: «aç tuşu istemiyorum, kutunun herhangi bir yerine tıklayınca açılsın»).
    // Kart bir <a> — orta tık / Ctrl+tık yeni sekmede açar, klavyeyle Enter çalışır.
    // Birden çok sürümü olan programda (AHU, yalnız yönetici) kart varsayılanı açar; öteki sürüm köşede küçük bağlantı.
    SIRA.oturum = oturum; SIRA.varsayilan = izinli.map(p => p.id);
    izinli = siraUygula(izinli, siraOku(oturum));
    $('sira_dugme').hidden = izinli.length < 2;
    $('ana_programlar').innerHTML = izinli.map(p => {
      const surumler = d.yonetici ? Object.keys(p.dosyalar) : [Object.keys(p.dosyalar)[0]];
      const href = '?ac=' + encodeURIComponent(p.id) + (surumler.length > 1 ? '&surum=' + surumler[0] : '');
      const diger = surumler.slice(1).map(s => '<span class="pkart-surum" role="link" tabindex="0" data-href="?ac=' + encodeURIComponent(p.id) + '&surum=' + s + '">' +
        (s === 'sade' ? 'sade sürüm' : kac(s)) + ' →</span>').join('');
      return '<a class="pkart pkart-tik" data-id="' + kac(p.id) + '" href="' + href + '" style="--pr:' + kac(p.renk || '#4d8dff') + '">' + diger + ikonHtml(p) + '<b>' + kac(p.ad) + '</b>' +
        '<span class="ufak">' + kac(p.aciklama || '') + '</span></a>';
    }).join('');
  }
  // Kartın köşesindeki öteki sürüm bağlantısı: kartın kendi tıklamasını durdurup kendi adresine gider
  $('ana_programlar').addEventListener('click', e => {
    const s = e.target.closest && e.target.closest('.pkart-surum');
    if (!s) return;
    e.preventDefault(); e.stopPropagation();
    location.href = s.dataset.href;
  });
  $('ana_programlar').addEventListener('keydown', e => {
    const s = e.target.closest && e.target.closest('.pkart-surum');
    if (s && e.key === 'Enter' && !$('ana_programlar').classList.contains('duzen')) { e.preventDefault(); e.stopPropagation(); location.href = s.dataset.href; }
  });
  $('ana_cikis').addEventListener('click', cikis);

  // KART SIRASI — kullanıcı ana sayfadaki program kartlarını sürükleyip yerleştirir (Cenk, 13.10.2026).
  // Sıra hesabın kendi user_metadata'sında (kart_sirasi) durur → her cihazda aynı; localStorage yalnız hızlı önbellek.
  // Sırada olmayan (yeni açılan) program sona, kendi config sırasıyla eklenir.
  const SIRA = { oturum: null, varsayilan: [] };
  const siraAnahtar = () => 'ahu_kart_sirasi:' + SIRA.oturum.user.id;
  function siraOku(oturum){
    const m = oturum.user.user_metadata && oturum.user.user_metadata.kart_sirasi;
    if (Array.isArray(m)) return m;
    try { const s = JSON.parse(localStorage.getItem('ahu_kart_sirasi:' + oturum.user.id)); if (Array.isArray(s)) return s; } catch (e) {}
    return null;
  }
  function siraUygula(liste, sira){
    if (!sira || !sira.length) return liste;
    const yer = id => { const i = sira.indexOf(id); return i < 0 ? 1e6 : i; };
    return liste.map((p, i) => [p, i]).sort((a, b) => (yer(a[0].id) - yer(b[0].id)) || (a[1] - b[1])).map(x => x[0]);
  }
  const kartlar = () => Array.from($('ana_programlar').querySelectorAll('.pkart[data-id]'));
  const siraSimdi = () => kartlar().map(k => k.dataset.id);
  function siraKaydet(){
    const ids = siraSimdi();
    const varsayilanmi = ids.join() === SIRA.varsayilan.join();
    try { if (varsayilanmi) localStorage.removeItem(siraAnahtar()); else localStorage.setItem(siraAnahtar(), JSON.stringify(ids)); } catch (e) {}
    sb.auth.updateUser({ data: { kart_sirasi: varsayilanmi ? null : ids } }).then(function(){}, function(){});
  }
  // Diğer kartlar yeni yerlerine kayarak geçer (FLIP): önce eski konumu ölç, DOM'u değiştir, farkı geri sar ve bırak.
  function kaydir(degistir, haric){
    const once = new Map(kartlar().map(k => [k, k.getBoundingClientRect()]));
    degistir();
    kartlar().forEach(k => {
      if (k === haric) return;
      const a = once.get(k), b = k.getBoundingClientRect();
      const dx = a.left - b.left, dy = a.top - b.top;
      if (!dx && !dy) return;
      k.style.transition = 'none'; k.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      requestAnimationFrame(() => requestAnimationFrame(() => { k.style.transition = 'transform .22s cubic-bezier(.16,1,.3,1)'; k.style.transform = ''; }));
      setTimeout(() => { k.style.transition = ''; }, 300);
    });
  }
  function duzenModu(ac){
    const kap = $('ana_programlar');
    kap.classList.toggle('duzen', ac);
    $('sira_dugme').textContent = ac ? 'Bitti' : 'Sırayı düzenle';
    $('sira_dugme').classList.toggle('acik', ac);
    $('sira_ipucu').hidden = !ac;
    $('sira_sifirla').hidden = !ac;
  }
  $('sira_dugme').addEventListener('click', () => duzenModu(!$('ana_programlar').classList.contains('duzen')));
  $('sira_sifirla').addEventListener('click', () => {
    const kap = $('ana_programlar');
    const bul = new Map(kartlar().map(k => [k.dataset.id, k]));
    kaydir(() => SIRA.varsayilan.forEach(id => { if (bul.has(id)) kap.appendChild(bul.get(id)); }));
    siraKaydet();
  });
  // Düzen kipinde kart açılmaz (öteki sürüm bağlantısı da)
  $('ana_programlar').addEventListener('click', e => {
    if ($('ana_programlar').classList.contains('duzen')) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  // Sürükleme: fare + dokunma (pointer olayları). Tutulan kart parmağı izler; altına geldiği kartın yerine geçer.
  // Hedef, kartların KAYAN görüntüsüne değil yerleşim yuvalarına (offset) göre seçilir; parmak yuvanın iç
  // bölgesine girmeden yer değişmez → kayan kartlar yüzünden ileri-geri titreme olmaz (Cenk: «çok pırpır yapıyor»).
  // Parmak ekranın üst/alt kenarına yaklaşınca sayfa kendiliğinden kayar → alttaki kartlara da ulaşılır.
  let tut = null;
  function yuva(k){
    const kap = $('ana_programlar'), r = kap.getBoundingClientRect();
    return { x: r.left + k.offsetLeft - kap.offsetLeft, y: r.top + k.offsetTop - kap.offsetTop, w: k.offsetWidth, h: k.offsetHeight };
  }
  $('ana_programlar').addEventListener('pointerdown', e => {
    const kap = $('ana_programlar');
    const k = kap.classList.contains('duzen') && e.target.closest('.pkart[data-id]');
    if (!k || e.button > 0) return;
    e.preventDefault();
    const y = yuva(k);
    tut = { k, px: e.clientX, py: e.clientY, dx: e.clientX - y.x, dy: e.clientY - y.y, ilk: siraSimdi().join(), kilit: 0,
            enAlt: document.documentElement.scrollHeight - innerHeight };   // taşınan kart sayfayı uzatmasın: en fazla ilk boy kadar kay
    k.setPointerCapture(e.pointerId);
    k.classList.add('tasiniyor');
    requestAnimationFrame(surukleAdim);
  });
  $('ana_programlar').addEventListener('pointermove', e => {
    if (!tut) return;
    tut.px = e.clientX; tut.py = e.clientY;
  });
  function surukleAdim(){
    if (!tut) return;
    const k = tut.k, kap = $('ana_programlar'), px = tut.px, py = tut.py;
    // kenarda kendiliğinden kaydırma: kenara ne kadar yakınsa o kadar hızlı
    const kenar = Math.min(90, innerHeight * 0.15);
    if (py < kenar) scrollBy(0, -Math.ceil((kenar - py) / kenar * 16));
    else if (py > innerHeight - kenar && scrollY < tut.enAlt) scrollTo(0, Math.min(tut.enAlt, scrollY + Math.ceil((py - innerHeight + kenar) / kenar * 16)));
    if (performance.now() > tut.kilit) {
      const h = kartlar().find(c => {
        if (c === k) return false;
        const s = yuva(c), mx = s.w * 0.2, my = s.h * 0.2;
        return px > s.x + mx && px < s.x + s.w - mx && py > s.y + my && py < s.y + s.h - my;
      });
      if (h) {
        const liste = kartlar();
        kaydir(() => kap.insertBefore(k, liste.indexOf(h) < liste.indexOf(k) ? h : h.nextSibling), k);
        tut.kilit = performance.now() + 150;
      }
    }
    const s = yuva(k);
    k.style.transform = 'translate(' + (px - tut.dx - s.x) + 'px,' + (py - tut.dy - s.y) + 'px)';
    requestAnimationFrame(surukleAdim);
  }
  function birak(){
    if (!tut) return;
    const k = tut.k, degisti = siraSimdi().join() !== tut.ilk;
    tut = null;
    k.classList.remove('tasiniyor');
    k.style.transition = 'transform .2s cubic-bezier(.16,1,.3,1)'; k.style.transform = '';
    setTimeout(() => { k.style.transition = ''; }, 250);
    if (degisti) siraKaydet();
  }
  $('ana_programlar').addEventListener('dragstart', e => { if ($('ana_programlar').classList.contains('duzen')) e.preventDefault(); });
  $('ana_programlar').addEventListener('pointerup', birak);
  $('ana_programlar').addEventListener('pointercancel', birak);
  // Klavye: düzen kipinde odaktaki kart ok tuşlarıyla bir öne / bir arkaya
  $('ana_programlar').addEventListener('keydown', e => {
    const kap = $('ana_programlar');
    if (!kap.classList.contains('duzen')) return;
    const k = e.target.closest('.pkart[data-id]');
    if (!k) return;
    const geri = e.key === 'ArrowLeft' || e.key === 'ArrowUp', ileri = e.key === 'ArrowRight' || e.key === 'ArrowDown';
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); return; }
    if (!geri && !ileri) return;
    e.preventDefault();
    const komsu = geri ? k.previousElementSibling : k.nextElementSibling;
    if (!komsu) return;
    kaydir(() => kap.insertBefore(k, geri ? komsu : komsu.nextSibling));
    k.focus();
    siraKaydet();
  });

  // Program simgesi (ikonlar.js) — kartta renkli kutu içinde, sekmede favicon olarak
  const IKON = window.AHU_IKON || {};
  function ikonSvg(p){ return IKON[p.ikon || p.id] || IKON.varsayilan || ''; }
  function ikonHtml(p){ return '<span class="pkart-ikon">' + ikonSvg(p) + '</span>'; }
  function sekmeSimgesi(p){
    const renk = p.renk || '#4d8dff';
    const ic = ikonSvg(p).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')
      .replace(/class="n"/g, 'fill="#fff" stroke="none"');   // dolu noktalar (karttaki circle.n kuralının karşılığı)
    const kutu = ikonSvg(p).match(/viewBox="([^"]+)"/);
    const vb = (kutu ? kutu[1] : '0 0 24 24').split(/\s+/).map(Number);
    // Arka plan karesi + simge (beyaz, ölçek viewBox'a göre)
    const s = 64, pay = 12, k = (s - 2 * pay) / Math.max(vb[2], vb[3]);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + s + ' ' + s + '">' +
      '<rect width="64" height="64" rx="16" fill="' + renk + '"/>' +
      '<g transform="translate(' + pay + ' ' + pay + ') scale(' + k + ') translate(' + (-vb[0]) + ' ' + (-vb[1]) + ')" ' +
      'color="#fff" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + ic + '</g></svg>';
    let l = document.querySelector('link[rel="icon"]');
    if (!l) { l = document.createElement('link'); l.rel = 'icon'; document.head.appendChild(l); }
    l.href = 'data:image/svg+xml,' + encodeURIComponent(svg);
  }
  const yonetimIkon = document.querySelector('.pkart-ikon.yonetim');
  if (yonetimIkon && IKON.yonetim) yonetimIkon.innerHTML = IKON.yonetim;

  function trTarih(s){ const p = String(s).split('-'); return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : s; }

  window.addEventListener('beforeunload', e => { if (acik) { e.preventDefault(); e.returnValue = ''; } });

  if (window.QrGiris) QrGiris.kur({ sb, A, mesaj, goster });   // KAREKODLA GİRİŞ (qr-giris.js)

  sb.auth.onAuthStateChange((olay, oturum) => {
    if (olay === 'PASSWORD_RECOVERY') { kurtarmaDonusu = true; goster('bolum_yeni'); return; }
    if (olay === 'SIGNED_IN' && oturum) dogrulamaKutusu(false);   // G-0017: oturum açıldı → uyarı kutusu gizlenir
    if (olay === 'SIGNED_IN' && oturum && !acik && $('bolum_yeni').hidden) setTimeout(() => lisansaBak(oturum), 0);
    if (olay === 'SIGNED_OUT') { acik = false; }
  });

  // G-0016 PKCE dönüş iletileri (sabit Türkçe; sunucu iletisi basılmaz)
  const PKCE_FARKLI = 'Bu bağlantı başka bir tarayıcıda istenmiş. Güvenlik için bağlantıyı kayıt olduğun tarayıcıda aç ' +
    '(şifre sıfırlama bağlantısını da sıfırlamayı istediğin tarayıcıda). E-posta doğrulama bağlantısıysa adresin doğrulandı; ' +
    'burada e-posta adresin ve şifrenle giriş yapabilirsin.';
  const PKCE_HATA = 'Bağlantı tamamlanamadı; süresi dolmuş ya da daha önce kullanılmış olabilir. E-posta doğrulama bağlantısıysa ' +
    'şifrenle giriş yapmayı dene, olmazsa aşağıdan yeniden gönder. Şifre sıfırlama bağlantısıysa «Şifremi unuttum» ile yenisini iste.';
  const ESKI_DOGRULAMA = 'E-posta adresin doğrulandı. Şimdi e-posta adresin ve şifrenle giriş yap.';
  const ESKI_GECERSIZ = 'Bu bağlantı artık geçerli değil. Şifre sıfırlama bağlantısıysa «Şifremi unuttum» ile yenisini iste; değilse giriş yap.';
  // Dönüş parametreleri adres çubuğundan silinir (kod, hata, eski belirteçler); ?ac= gibi öteki parametreler kalır
  function donusAdresiniTemizle(){
    try {
      const u = new URL(location.href);
      ['code', 'error', 'error_code', 'error_description', 'sb_flow_id'].forEach(k => u.searchParams.delete(k));
      history.replaceState(history.state, '', u.pathname + u.search);
    } catch (e) {}
  }

  (async () => {
    // initialize() adresteki kodun takas sonucunu verir: takas DENENİP başarısız olduysa hata döner; doğrulayıcı yoksa
    // (başka tarayıcı) takas denenmez, hata da dönmez.
    let adresHatasi = null;
    try { const r = await sb.auth.initialize(); adresHatasi = (r && r.error) || null; } catch (e) { adresHatasi = e; }
    const { data } = await sb.auth.getSession();
    // §1.5 hatalı dönüş (süresi dolmuş / kullanılmış / geçersiz bağlantı): sabit Türkçe ileti + yeniden gönder, adres temizlenir
    if (donusHatasi && !data.session) {
      mesaj(donusHatasi === 'otp_expired'
        ? 'Doğrulama bağlantısının süresi dolmuş ya da daha önce kullanılmış. E-posta adresini yazıp yeniden gönder. (Şifre sıfırlama bağlantısıysa «Şifremi unuttum» ile yenisini iste.)'
        : 'Bağlantı geçersiz. Yeniden gönder ya da giriş yap.', 'hata');
      dogrulamaKutusu(true, null);   // G-0017 durum 3: süresi dolmuş / geçersiz bağlantıyla dönüş (adres bilinmez)
    } else if (PKCE_KODU && !data.session && !kurtarmaDonusu) {
      if (adresHatasi) {
        // takas denendi, sunucu reddetti (süresi dolmuş / kullanılmış kod, uyuşmayan doğrulayıcı) — ayrıntı yalnız konsola
        console.warn('[bağlantı dönüşü]', adresHatasi && (adresHatasi.code || adresHatasi.name));
        mesaj(PKCE_HATA, 'hata');
        dogrulamaKutusu(true, null);
      } else mesaj(PKCE_FARKLI, 'bilgi');   // bu tarayıcıda doğrulayıcı yok: bağlantı başka tarayıcıda istenmiş
    } else if (ESKI_BAGLANTI && !data.session) {
      mesaj(ESKI_BAGLANTI === 'signup' ? ESKI_DOGRULAMA : ESKI_GECERSIZ, ESKI_BAGLANTI === 'signup' ? 'tamam' : 'hata');
    }
    if (donusHatasi || PKCE_KODU || ESKI_BAGLANTI) donusAdresiniTemizle();
    if (data.session && !acik && $('bolum_yeni').hidden && !kurtarmaDonusu) lisansaBak(data.session);
  })();
})();
