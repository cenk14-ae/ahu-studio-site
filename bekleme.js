// İŞLENİYOR GÖSTERGESİ (08.10.2026) — Cenk: «1 saniyeden uzun süren işlemlerde öylece belirsiz
// bekletmektense ekrandan yükleniyor gibi bir şey çıksın; kullanıcı program dondu sanmasın».
// Programların İÇİNE DOKUNULMAZ: açık programın (ve iç çerçevelerinin) fetch'i sarılır; sunucu
// çekirdeğine (functions/v1/cekirdek) giden bir istek 1 sn'yi geçerse ortada gösterge çıkar,
// bütün istekler bitince kaybolur. İstek türüne göre ne yapıldığı yazılır.
(function () {
  'use strict';
  var GECIKME = 1000;
  var bekleyen = 0, sayac = null, saat = null, bas = 0, etiket = '';
  var kutu = null;

  function kur() {
    if (kutu) return kutu;
    kutu = document.createElement('div');
    kutu.id = 'isleniyor';
    kutu.setAttribute('role', 'status');
    kutu.setAttribute('aria-live', 'polite');
    kutu.hidden = true;
    kutu.innerHTML = '<div class="isl-kart"><i class="isl-donen" aria-hidden="true"></i>' +
      '<div><b id="isl-baslik">İşleniyor…</b><span id="isl-alt">Sunucuda hesaplanıyor</span></div>' +
      '<em id="isl-sure">1 sn</em></div>';
    document.body.appendChild(kutu);
    return kutu;
  }

  // İstek gövdesinden ne yapıldığını kestir (yalnız metin; gövde okunmaz değiştirilmez)
  function isAdi(govde) {
    var s = typeof govde === 'string' ? govde.slice(0, 400) : '';
    if (/excel/i.test(s)) return 'Excel hazırlanıyor';
    if (/analiz/i.test(s)) return 'Malzeme analizi hesaplanıyor';
    if (/planlama/i.test(s)) return 'Planlama dosyası hazırlanıyor';
    if (/nest/i.test(s)) return 'Sac yerleşimi hesaplanıyor';
    if (/dxfOku|dxfKur|dxfYuk/i.test(s)) return 'Çizim okunuyor';
    if (/gercek|gsm/i.test(s)) return 'Kapaklar yerleştiriliyor';
    if (/kizak|foy|pdf/i.test(s)) return 'Batarya föyü okunuyor';
    if (/tikla|toplu|btn-/i.test(s)) return 'DXF dosyaları üretiliyor';
    return 'İşleniyor';
  }

  function goster() {
    kur();
    document.getElementById('isl-baslik').textContent = (etiket || 'İşleniyor') + '…';
    kutu.hidden = false;
    clearInterval(saat);
    saat = setInterval(function () {
      var sn = Math.max(1, Math.round((Date.now() - bas) / 1000));
      document.getElementById('isl-sure').textContent = sn + ' sn';
      if (sn >= 8) document.getElementById('isl-alt').textContent = 'Büyük bir iş — biraz sürebilir, lütfen bekleyin';
    }, 250);
  }
  function gizle() {
    clearTimeout(sayac); sayac = null; clearInterval(saat);
    if (kutu) { kutu.hidden = true; document.getElementById('isl-alt').textContent = 'Sunucuda hesaplanıyor'; }
  }

  // DEMO: sunucu dosya üreten isteği 403 {hata:'demo'} ile reddederse ekranın ortasındaki uyarı kartı açılır
  function demoYanit(r) {
    try {
      if (!r || r.status !== 403 || typeof window.ahuDemoUyari !== 'function') return;
      r.clone().json().then(function (j) { if (j && j.hata === 'demo') window.ahuDemoUyari(); }).catch(function () {});
    } catch (e) {}
  }

  function sar(win) {
    try {
      if (!win || win.__islIzlendi || typeof win.fetch !== 'function') return;
      var asil = win.fetch;
      win.fetch = function (u, o) {
        var url = typeof u === 'string' ? u : (u && u.url) || '';
        if (url.indexOf('/functions/v1/cekirdek') < 0) return asil.apply(this, arguments);
        if (bekleyen === 0) {
          bas = Date.now(); etiket = isAdi(o && o.body);
          sayac = setTimeout(goster, GECIKME);
        }
        bekleyen++;
        var bitti = function () { bekleyen = Math.max(0, bekleyen - 1); if (!bekleyen) gizle(); };
        var p;
        try { p = asil.apply(this, arguments); } catch (e) { bitti(); throw e; }
        return p.then(function (r) { bitti(); demoYanit(r); return r; }, function (e) { bitti(); throw e; });
      };
      // Açık bağlantı (WebSocket) üzerinden gelen 403 demo yanıtı da kartı açar
      if (typeof win.WebSocket === 'function' && !win.WebSocket.__demo) {
        var WS = win.WebSocket;
        var Yeni = function (u, p) { var ws = p === undefined ? new WS(u) : new WS(u, p);
          try { ws.addEventListener('message', function (m) { if (typeof m.data === 'string' && m.data.indexOf('"demo"') >= 0 && typeof window.ahuDemoUyari === 'function') { try { var j = JSON.parse(m.data); if (JSON.stringify(j).indexOf('"hata":"demo"') >= 0) window.ahuDemoUyari(); } catch (e) {} } }); } catch (e) {}
          return ws; };
        Yeni.prototype = WS.prototype; ['CONNECTING','OPEN','CLOSING','CLOSED'].forEach(function (k) { Yeni[k] = WS[k]; });
        Yeni.__demo = true; win.WebSocket = Yeni;
      }
      win.__islIzlendi = true;
    } catch (e) { /* başka köken ya da erişilemez — geç */ }
  }

  // Açık programın penceresi ve bütün iç çerçeveleri (AHU Studio: f0..f3) — çerçeveler sonradan
  // yüklendiği ya da yeniden yüklenebildiği için bir süre aralıklarla yoklanır.
  function tara(win, derinlik) {
    if (!win || derinlik > 3) return;
    sar(win);
    try {
      var fr = win.document.querySelectorAll('iframe');
      for (var i = 0; i < fr.length; i++) tara(fr[i].contentWindow, derinlik + 1);
    } catch (e) {}
  }

  document.addEventListener('DOMContentLoaded', function () {
    var f = document.getElementById('uygulama');
    if (!f) return;
    f.addEventListener('load', function () {
      var n = 0;
      (function yokla() { tara(f.contentWindow, 0); if (++n < 60) setTimeout(yokla, 500); })();
    });
  });
  // Yükleyicinin kendi penceresi de (ileride doğrudan çağrı olursa)
  sar(window);
})();
