// ÇEREZ BİLDİRİMİ (24.11.2026) — Cenk: «çerez onayı vs bu tarz şeyleri de yap».
// Sitede yalnız ZORUNLU çerez/yerel depolama var (cerez.html tablosu); reklam/analiz çerezi yok. KVKK Çerez Uygulamaları
// Rehberi'ne göre zorunlu çerez açık rıza gerektirmez, bilgilendirme yeter → «Kabul / Reddet» yerine bilgi bandı + «Tamam».
// İleride analiz/pazarlama çerezi eklenirse burası rıza bandına çevrilmeli ve o çerez rızadan ÖNCE yüklenmemeli.
(function () {
  'use strict';
  var ANAHTAR = 'ahu_cerez_bilgi';
  try { if (localStorage.getItem(ANAHTAR)) return; } catch (e) { return; }
  var d = document.createElement('div');
  d.className = 'cerez-band'; d.setAttribute('role', 'region'); d.setAttribute('aria-label', 'Çerez bilgilendirmesi');
  var p = document.createElement('p');
  p.appendChild(document.createTextNode('Bu site yalnız çalışması ve hesap güvenliği için zorunlu çerez ve tarayıcı kayıtları kullanır; reklam veya analiz çerezi kullanılmaz. '));
  var a = document.createElement('a'); a.href = 'cerez.html'; a.textContent = 'Çerez Politikası';
  p.appendChild(a);
  var b = document.createElement('button'); b.type = 'button'; b.className = 'dugme'; b.textContent = 'Tamam';
  b.addEventListener('click', function () {
    try { localStorage.setItem(ANAHTAR, '2026-11-24'); } catch (e) {}
    d.remove();
  });
  d.appendChild(p); d.appendChild(b);
  document.body.appendChild(d);
})();
