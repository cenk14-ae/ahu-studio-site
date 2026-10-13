// ETKİNLİK KAYDI (13.10.2026, Cenk: «profiline tıkladığımda bütün logları tutulsun: saat kaçta girdi,
// ne kadar aktif kaldı, hangi programı kullandı, programda neler yaptı»). Veritabanı: supabase/10-etkinlik-kaydi.sql
//   · Her sayfa açılışı bir ZİYARET (ana sayfa ya da bir program); dakikada bir nabız son sinyali ve aktif süreyi yazar.
//   · AKTİF süre: sekme önde ve son 60 sn içinde fare/klavye/dokunma varken sayılır.
//   · OLAYLAR: programın (ve iç çerçevelerinin) basılan düğme/sekme/menüleri, değiştirilen alanlar (sayı, seçim,
//     kutu — yazı alanlarının içeriği YAZILMAZ), açılan/indirilen dosya adları. Programlara dokunulmaz;
//     kabuk aynı kökenden dinler (bekleme.js / demoKur deseni).
//   · Her şey sessizdir: kayıt hata verirse program etkilenmez.
(function () {
  'use strict';
  var sb = null, ayar = null, ziyaret = null, belirtec = '', kuyruk = [], aktifSn = 0, sonEtk = 0,
      sonTik = Date.now(), nabizSayac = null, tikSayac = null, kok = null;
  var TIK_MS = 5000, NABIZ_MS = 60000, BOSTA_MS = 60000, KUYRUK_EN = 400;

  function kisalt(s, n) { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  function ekle(olay) {
    if (!ziyaret || !olay) return;
    var son = kuyruk[kuyruk.length - 1];
    if (son && son.o === olay) { son.n++; return; }          // art arda aynı olay → adet
    if (kuyruk.length >= KUYRUK_EN) return;
    kuyruk.push({ z: new Date().toISOString(), o: kisalt(olay, 200), n: 1 });
  }

  function etkilesim() { sonEtk = Date.now(); }

  // --- öğenin okunur adı
  function etiketMetni(el) {
    var d = el.ownerDocument, m = '';
    if (el.id) { try { var l = d.querySelector('label[for="' + (window.CSS && CSS.escape ? CSS.escape(el.id) : el.id) + '"]'); if (l) m = l.textContent; } catch (e) {} }
    if (!m) { var kl = el.closest('label'); if (kl) m = kl.textContent; }
    m = m || el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('placeholder') || el.name || el.id || '';
    if (!m) {   // tablo / form satırında önceki hücre ya da kardeş metni
      var o = el.previousElementSibling; if (o && o.textContent) m = o.textContent;
      if (!m && el.parentElement && el.parentElement.previousElementSibling) m = el.parentElement.previousElementSibling.textContent;
    }
    return kisalt(m, 60);
  }
  function dugmeAdi(el) {
    var m = el.getAttribute('aria-label') || '';
    if (!m) m = el.tagName === 'INPUT' ? (el.value || '') : (el.innerText || el.textContent || '');
    if (!kisalt(m, 60)) m = el.getAttribute('title') || el.getAttribute('data-tip') || el.id || '';
    return kisalt(m, 60);
  }
  function cerceveAdi(d) { try { var t = d.title; return t && t !== document.title ? kisalt(t, 40) + ' › ' : ''; } catch (e) { return ''; } }

  var DUGME = 'button,a[href],[role=button],[role=tab],[role=menuitem],[role=option],[role=switch],summary,input[type=button],input[type=submit],[onclick],.tab,.sekme';

  function tikla(e) {
    etkilesim();
    try {
      var t = e.target; if (!t || !t.closest) return;
      var a = t.closest('a[download]');
      if (a) { ekle('İndirdi: ' + kisalt(a.getAttribute('download') || dugmeAdi(a), 80)); return; }
      var el = t.closest(DUGME); if (!el) return;
      if (el.tagName === 'INPUT' && /checkbox|radio|file/.test(el.type)) return;   // change ile yazılır
      var ad = dugmeAdi(el); if (!ad) return;
      var tur = /tab/.test(el.getAttribute('role') || '') || /\b(tab|sekme)\b/.test(el.className || '') ? 'Sekme' : el.tagName === 'A' ? 'Bağlantı' : 'Düğme';
      ekle(cerceveAdi(el.ownerDocument) + tur + ': ' + ad);
    } catch (x) {}
  }
  function degisti(e) {
    try {
      var el = e.target; if (!el || !el.tagName) return;
      var ad = etiketMetni(el), on = cerceveAdi(el.ownerDocument);
      if (el.tagName === 'SELECT') {
        var s = el.options[el.selectedIndex];
        ekle(on + 'Seçim: ' + (ad || 'liste') + ' → ' + kisalt(s ? s.text : el.value, 60));
      } else if (el.type === 'file') {
        var adlar = Array.prototype.map.call(el.files || [], function (f) { return f.name; }).join(', ');
        ekle(on + 'Dosya açtı: ' + kisalt(adlar || ad, 100));
      } else if (el.type === 'checkbox' || el.type === 'radio') {
        if (el.type === 'radio' && !el.checked) return;
        ekle(on + (ad || 'kutu') + ': ' + (el.type === 'radio' ? 'seçildi' : el.checked ? 'açık' : 'kapalı'));
      } else if (el.type === 'number' || el.type === 'range' || el.type === 'date' || el.type === 'color') {
        ekle(on + 'Değer: ' + (ad || 'alan') + ' = ' + kisalt(el.value, 30));
      } else if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
        if (el.type === 'password' || el.type === 'hidden') return;
        ekle(on + 'Yazı alanı: ' + (ad || 'alan'));      // içerik yazılmaz
      }
    } catch (x) {}
  }

  // --- bir pencereye (ve iç çerçevelerine) dinleyici kur
  function kur(w) {
    try {
      if (!w || !w.document || w.__etkKuruldu === w.document) return;
      w.__etkKuruldu = w.document;
      var d = w.document;
      d.addEventListener('click', tikla, true);
      d.addEventListener('change', degisti, true);
      ['keydown', 'pointerdown', 'wheel', 'touchstart'].forEach(function (t) { d.addEventListener(t, etkilesim, { capture: true, passive: true }); });
      var son = 0;
      d.addEventListener('pointermove', function () { var s = Date.now(); if (s - son > 2000) { son = s; etkilesim(); } }, { capture: true, passive: true });
      // programın kodla tıklattığı indirmeler (a.click() — belgeye bağlı olmayan bağlantı)
      var P = w.HTMLAnchorElement && w.HTMLAnchorElement.prototype;
      if (P && !P.__etkClick) {
        var asil = P.click;
        P.click = function () { try { if (this.hasAttribute('download') && !this.isConnected) ekle('İndirdi: ' + kisalt(this.getAttribute('download') || 'dosya', 80)); } catch (x) {} return asil.apply(this, arguments); };
        P.__etkClick = true;
      }
    } catch (x) {}
    icCerceveler(w);
  }
  function icCerceveler(w) {
    try {
      Array.prototype.forEach.call(w.document.querySelectorAll('iframe'), function (fr) {
        try { kur(fr.contentWindow); } catch (x) {}
        if (!fr.__etkYuk) { fr.__etkYuk = true; fr.addEventListener('load', function () { try { kur(fr.contentWindow); } catch (x) {} }); }
      });
    } catch (x) {}
  }

  // --- sayaç: aktif süre + yeni açılan çerçeveler
  function tik() {
    var s = Date.now(), gecen = Math.min(s - sonTik, TIK_MS * 3); sonTik = s;
    if (document.visibilityState === 'visible' && s - sonEtk < BOSTA_MS) aktifSn += gecen / 1000;
    if (kok) { try { kur(kok); } catch (x) {} }
  }

  function govde() { var o = kuyruk; kuyruk = []; return { ziyaret: ziyaret, aktif_sn: Math.round(aktifSn), olaylar: o }; }

  async function nabiz() {
    if (!ziyaret) return;
    var b = govde();
    try {
      var g = await sb.auth.getSession(); if (g.data && g.data.session) belirtec = g.data.session.access_token;
      var r = await sb.rpc('ziyaret_nabiz', b);
      if (r.error && b.olaylar.length && ziyaret === b.ziyaret) kuyruk = b.olaylar.concat(kuyruk).slice(0, KUYRUK_EN);   // sonra yeniden dene
    } catch (x) {}
  }
  // sayfa kapanırken: supabase-js keepalive yollayamaz → doğrudan REST (son belirteçle)
  function kapanis() {
    if (!ziyaret || !belirtec) return;
    tik();
    try {
      fetch(ayar.SUPABASE_URL + '/rest/v1/rpc/ziyaret_nabiz', {
        method: 'POST', keepalive: true,
        headers: { 'Content-Type': 'application/json', apikey: ayar.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + belirtec },
        body: JSON.stringify(govde())
      }).catch(function () {});
    } catch (x) {}
  }

  window.EtkinlikKaydi = {
    // program: config.js'teki id (ana sayfada null). Aynı sayfada ikinci kez çağrılırsa yeni ziyaret açar.
    baslat: async function (o) {
      try {
        sb = o.sb; ayar = o.ayar || window.AHU_AYAR;
        if (ziyaret) await nabiz();
        var g = await sb.auth.getSession(); if (g.data && g.data.session) belirtec = g.data.session.access_token;
        var r = await sb.rpc('ziyaret_baslat', { program: o.program || null, cihaz: navigator.userAgent });
        if (r.error || !r.data) return;
        ziyaret = r.data; kuyruk = []; aktifSn = 0; sonEtk = sonTik = Date.now();
        if (!tikSayac) {
          kur(window);
          tikSayac = setInterval(tik, TIK_MS);
          nabizSayac = setInterval(nabiz, NABIZ_MS);
          window.addEventListener('pagehide', kapanis);
          document.addEventListener('visibilitychange', function () { tik(); if (document.visibilityState === 'hidden') nabiz(); });
        }
      } catch (x) {}
    },
    // program çerçevesi yüklendi: içini de dinle
    cerceve: function (w) { kok = w; kur(w); },
    // program dışı önemli olay (ör. oturum düştü)
    olay: function (m) { ekle(m); },
    bitir: function () { var p = nabiz(); clearInterval(nabizSayac); clearInterval(tikSayac); nabizSayac = tikSayac = null; ziyaret = null; return p; }
  };
})();
