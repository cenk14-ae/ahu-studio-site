// TARAYICI KAPANINCA YENİDEN GİRİŞ (08.10.2026)
// Supabase oturumu localStorage'da durur (sekmeler arasında paylaşılır, ince programın
// sunucu köprüsü de belirteci oradan okur). Tarayıcı kapanınca düşmesi için iki işaret:
//  · OTURUM ÇEREZİ (Expires yok) — tarayıcı kapanınca silinir
//  · NABIZ — sitenin açık bir sekmesi 30 sn'de bir zaman yazar; 10 dk'dır yazılmamışsa
//    tarayıcı kapanmış sayılır (Chrome "kaldığım yerden devam et" çerezi geri getirse bile)
// İkisinden biri yoksa kayıtlı oturum SİLİNİR ve veritabanındaki aktif oturum boşaltılır
// (yeniden girişte "hesap zaten açık" uyarısı çıkmasın). Bu dosya createClient'tan ÖNCE yüklenir.
(function () {
  'use strict';
  var A = window.AHU_AYAR || {};
  var ref = (A.SUPABASE_URL || '').replace(/^https?:\/\//, '').split('.')[0];
  var K = 'sb-' + ref + '-auth-token', N = 'ahu_son_nabiz', C = 'ahu_tarayici';
  var BAYAT_MS = 10 * 60 * 1000;
  try {
    var cerez = document.cookie.split('; ').some(function (c) { return c.indexOf(C + '=') === 0; });
    var son = +(localStorage.getItem(N) || 0);
    var kayit = localStorage.getItem(K);
    if (kayit && (!cerez || !son || Date.now() - son > BAYAT_MS)) {
      // Aktif oturumu sunucuda boşalt (belirteç hâlâ geçerliyse; değilse sessiz geç)
      try {
        var j = JSON.parse(kayit);
        if (j && j.access_token && A.SUPABASE_URL)
          fetch(A.SUPABASE_URL + '/rest/v1/rpc/oturum_bitir', {
            method: 'POST', keepalive: true,
            headers: { apikey: A.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + j.access_token, 'Content-Type': 'application/json' },
            body: '{}'
          }).catch(function () {});
      } catch (e) {}
      localStorage.removeItem(K);
    }
    document.cookie = C + '=1; path=/; SameSite=Lax';
  } catch (e) {}
  function nabiz() { try { localStorage.setItem(N, String(Date.now())); } catch (e) {} }
  nabiz();
  setInterval(nabiz, 30000);
})();
