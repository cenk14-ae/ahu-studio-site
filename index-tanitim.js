// İLETİŞİM — e-posta adresi parçalardan kurulur
(function () {
  var a = document.getElementById('iletisim_posta'), p = ['cenk.altinay', 'gmail.com'].join(String.fromCharCode(64));
  a.textContent = p; a.href = 'mailto:' + p;
})();
// TANITIM VİDEOLARI — kart tıklanınca ortada büyük oynatıcı; Esc / perde / ✕ kapatır, video durur
(function () {
  var m = document.getElementById('video_modal'), v = document.getElementById('vm_video');
  function kapat() { v.pause(); v.removeAttribute('src'); v.load(); m.hidden = true; }
  document.querySelectorAll('#tanitim .tn-kart').forEach(function (k) {
    k.addEventListener('click', function () {
      document.getElementById('vm_ad').textContent = k.dataset.ad;
      v.poster = k.querySelector('img').src; v.src = k.dataset.video;
      m.hidden = false; v.play().catch(function () {});
    });
  });
  document.getElementById('vm_kapat').addEventListener('click', kapat);
  m.addEventListener('click', function (e) { if (e.target === m) kapat(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !m.hidden) kapat(); });
})();
