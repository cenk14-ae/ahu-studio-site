// Yasal sayfalar (24.11.2026): iletişim e-postası sayfa kaynağında düz yazılmaz (e-posta toplayan botlar),
// index-tanitim.js'teki gibi parçalardan kurulur. Satır içi betik yok (sıkı CSP).
(function () {
  'use strict';
  var p = ['cenk.altinay', 'gmail.com'].join(String.fromCharCode(64));
  document.querySelectorAll('.posta').forEach(function (a) { a.textContent = p; a.href = 'mailto:' + p; });
})();
