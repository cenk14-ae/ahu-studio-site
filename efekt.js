// ALTINAY — site geneli efekt katmanı (08.10.2026)
// AHU Studio'nun EFEKT KATMANI'nın aynısı (index.html f0: temaSplash / temaBeam / temaGiris /
// imleç ışığı) sitenin bütününe yayıldı. Renkler stil.css token'larından gelir.
//  · Efekt.perde()      — ışık üçgeni perdesi; HEMEN ekranı kaplar, .bitir() çağrılana dek
//                         noktalar parlar, sonra solar. Sayfa "iki kez açılıyor" görünmesin diye
//                         içerik hazır olana kadar perde kalkmaz.
//  · Efekt.beam()       — ekranı geçen ışık süpürmesi (sayfa/bölüm geçişleri)
//  · Efekt.giris(sec)   — kartların sırayla içeri girmesi
//  · imleç ışığı        — [data-isik] kartlarda imleci izleyen ışık (CSS --mx/--my)
(function () {
  'use strict';
  var NOKTA = [[0,0,0],[-0.5,1,8],[0.5,1,1],[-1,2,7],[0,2,40],[1,2,2],
               [-1.5,3,6],[-0.5,3,5],[0.5,3,4],[1.5,3,3]];
  var IN_MS = 1250, CIKIS_MS = 600;
  var az = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function perde() {
    var bos = { bitir: function (cb) { if (cb) cb(); } };
    if (az || !document.body) return bos;
    var eski = document.getElementById('efekt-perde'); if (eski) eski.remove();
    var d = document.createElement('div'); d.id = 'efekt-perde';
    var tri = document.createElement('div'); tri.className = 'tri';
    NOKTA.forEach(function (p, i) {
      var n = document.createElement('i');
      n.style.setProperty('--x', p[0]); n.style.setProperty('--y', p[1]);
      n.style.setProperty('--i', i); n.style.setProperty('--p', p[2]);
      tri.appendChild(n);
    });
    d.appendChild(tri);
    document.body.appendChild(d);
    var t0 = performance.now(), bitti = false;
    // iki kare bekle: ağır açılış işi bitince oynasın (AHU Studio'daki ölçümün aynısı)
    // Arka plan sekmesinde kare gelmez: süre sekme öne gelince başlar (t0 o an sıfırlanır)
    requestAnimationFrame(function () { requestAnimationFrame(function () { t0 = performance.now(); d.classList.add('oyna'); }); });
    return {
      bitir: function (cb) {
        if (bitti) return; bitti = true;
        var kalan = Math.max(0, IN_MS - (performance.now() - t0));
        setTimeout(function () {
          d.classList.add('bitti');
          if (cb) setTimeout(cb, CIKIS_MS * 0.35);           // içerik perde solarken girsin
          setTimeout(function () { if (d.parentNode) d.remove(); }, CIKIS_MS + 50);
        }, kalan);
      }
    };
  }

  function beam() {
    if (az || !document.body) return;
    var eski = document.getElementById('efekt-beam'); if (eski) eski.remove();
    var b = document.createElement('div'); b.id = 'efekt-beam';
    document.body.appendChild(b);
    setTimeout(function () { if (b.parentNode) b.remove(); }, 1300);
  }

  function giris(secici) {
    if (az) return;
    var k = document.querySelectorAll(secici);
    k.forEach(function (c, i) { c.style.setProperty('--i', Math.min(i, 12)); c.classList.add('efekt-gir'); });
    setTimeout(function () { k.forEach(function (c) { c.classList.remove('efekt-gir'); }); }, 1400);
  }

  // İmleç ışığı: kartın üstündeki konumu CSS değişkenine yazar
  document.addEventListener('pointermove', function (e) {
    var c = e.target && e.target.closest && e.target.closest('[data-isik], .pkart, .panel, #giris_sahne .kart');
    if (!c) return;
    var r = c.getBoundingClientRect();
    c.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    c.style.setProperty('--my', (e.clientY - r.top) + 'px');
  }, { passive: true });

  window.Efekt = { perde: perde, beam: beam, giris: giris };
})();
