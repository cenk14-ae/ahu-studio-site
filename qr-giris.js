// ============================================================================
// AHU Studio — KAREKODLA GİRİŞ (12.11.2026). Cenk: «pc'de siteyi açınca telefondan okutup girsek».
// Sunucu: supabase/functions/qr-giris (Edge Function) + supabase/21-qr-giris.sql. Karekod çizimi: qr-kod.js
// (qrcode-generator 1.4.4, Kazuhiko Arase, MIT — sitede barındırılır, dış betik yok).
//
// Bilgisayar (geniş ekran, giriş formu açıkken): kartın altında karekod + eşleşme sayısı; 2 sn'de bir onay sorulur.
//   Onaylanınca tek kullanımlık belirteç sb.auth.verifyOtp ile oturuma çevrilir → olağan akış (SIGNED_IN → lisansaBak).
//   Karekod 2 dk geçerli, kendiliğinden yenilenir (en çok 5 kez; sonra «Yeni karekod» düğmesi).
// Telefon (?qr=<id>): giriş yapılmışsa onay ekranı (bilgisayar bilgisi + 3 sayıdan doğrusu); yapılmamışsa önce şifreyle giriş,
//   sonra onay ekranı. Telefonda lisans / tek oturum akışı ÇALIŞMAZ: telefon etkin cihaz olmaz, bilgisayarı düşürmez.
// Ana betiğe üç bağlantı: QrGiris.kur({...}) · lisansaBak başında QrGiris.yakala(oturum) · tek oturumda QrGiris.qrIleGirildi().
// ============================================================================
(function(){
  'use strict';
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ADRES_QR = (function(){ try { const v = new URLSearchParams(location.search).get('qr'); return v && UUID.test(v) ? v.toLowerCase() : null; } catch (e) { return null; } })();
  const GENIS = () => window.matchMedia('(min-width: 760px) and (pointer: fine)').matches;
  let C = null;                 // { sb, A, mesaj, goster }
  let qrIle = false;            // bu sayfada oturum karekodla mı açıldı
  let onayGosterildi = false;   // telefon onay ekranı bir kez kurulur
  // bilgisayar tarafı durumu
  let pc = null, yenileme = 0, zamanlayici = null, sayac = null, istekte = false, durdu = false;

  function el(tag, ozellik, cocuklar){
    const e = document.createElement(tag);
    if (ozellik) for (const k in ozellik) { if (k === 'text') e.textContent = ozellik[k]; else if (k === 'class') e.className = ozellik[k]; else e.setAttribute(k, ozellik[k]); }
    (cocuklar || []).forEach(c => e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return e;
  }
  function stilEkle(){
    if (document.getElementById('qr-stil')) return;
    const s = el('style', { id: 'qr-stil' });
    s.textContent =
      '.qr-panel{margin-top:20px;padding-top:16px;border-top:1px solid var(--line-2);text-align:center}' +
      '.qr-panel h2{font-size:13px;font-weight:600;margin:0 0 10px;color:var(--t-1)}' +
      '.qr-kutu{display:inline-block;background:#fff;padding:8px;border-radius:8px;line-height:0}' +
      '.qr-kutu svg{width:168px;height:168px;display:block}' +
      '.qr-kutu.soluk{opacity:.25}' +
      '.qr-metin{color:var(--t-2);font-size:12.5px;line-height:1.5;margin:10px 0 0}' +
      '.qr-sayi{display:inline-block;min-width:44px;padding:2px 8px;margin:0 3px;border-radius:6px;background:var(--accent-soft);color:var(--accent-2);font-weight:700;font-size:18px;letter-spacing:.04em}' +
      '.qr-sure{color:var(--t-3);font-size:11.5px;margin-top:6px}' +
      '.qr-panel .dugme{margin-top:10px}' +
      '@media (max-height:820px){.qr-panel{margin-top:14px;padding-top:12px}.qr-kutu svg{width:124px;height:124px}.qr-metin{margin-top:6px}}' +
      '#bolum_qr .qr-cihaz{background:var(--bg-2);border:1px solid var(--line-2);border-radius:var(--r);padding:10px 12px;font-size:13px;line-height:1.55;color:var(--t-2);margin:0 0 16px}' +
      '#bolum_qr .qr-cihaz b{color:var(--t-1);font-weight:600}' +
      '#bolum_qr .qr-secenek{display:flex;gap:10px;justify-content:center;margin:12px 0 6px}' +
      '#bolum_qr .qr-secenek button{flex:1;max-width:96px;padding:14px 0;font:inherit;font-size:26px;font-weight:700;border-radius:10px;border:1px solid var(--line-3);background:var(--bg-3);color:var(--t-1);cursor:pointer}' +
      '#bolum_qr .qr-secenek button:disabled{opacity:.5;cursor:default}' +
      '#bolum_qr .qr-uyari{font-size:12px;color:var(--warn);line-height:1.5;margin:14px 0 0}' +
      '#bolum_qr .alt-not{margin-top:16px}';
    document.head.appendChild(s);
  }

  // --- sunucu çağrısı (fonksiyon --no-verify-jwt; telefonda oturum belirteci gönderilir)
  async function cagir(govde, belirtec){
    const h = { 'content-type': 'application/json', apikey: C.A.SUPABASE_ANON_KEY };
    if (belirtec) h.Authorization = 'Bearer ' + belirtec;
    const r = await fetch(C.A.SUPABASE_URL + '/functions/v1/qr-giris', { method: 'POST', headers: h, body: JSON.stringify(govde) });
    let j = null; try { j = await r.json(); } catch (e) {}
    return { durum: r.status, veri: j || {} };
  }

  function cihazAdi(ua){
    ua = String(ua || '');
    const is = /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? (/(iPhone|iPad)/.test(ua) ? 'iOS' : 'Mac') : /Android/.test(ua) ? 'Android' : /Linux/.test(ua) ? 'Linux' : 'bilinmeyen sistem';
    const tr = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'tarayıcı';
    return is + ' · ' + tr;
  }
  function saat(iso){ try { const d = new Date(iso); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); } catch (e) { return ''; } }

  function qrSvg(metin){
    const q = window.qrcode(0, 'M'); q.addData(metin); q.make();
    const n = q.getModuleCount(), m = 2, b = n + 2 * m;
    let yol = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) yol += 'M' + (x + m) + ' ' + (y + m) + 'h1v1h-1z';
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + b + ' ' + b); svg.setAttribute('shape-rendering', 'crispEdges');
    svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Telefonla giriş karekodu');
    const p = document.createElementNS(ns, 'path'); p.setAttribute('d', yol); p.setAttribute('fill', '#000');
    svg.appendChild(p);
    return svg;
  }

  // ======================= BİLGİSAYAR: karekod paneli =======================
  function panelKur(){
    if (document.getElementById('qr_panel') || !window.qrcode) return;
    const bolum = document.getElementById('bolum_form');
    if (!bolum) return;
    const p = el('div', { id: 'qr_panel', class: 'qr-panel' }, [
      el('h2', { text: 'ya da telefonla gir' }),
      el('div', { id: 'qr_kutu', class: 'qr-kutu soluk' }),
      el('p', { id: 'qr_metin', class: 'qr-metin', text: 'Karekod hazırlanıyor…' }),
      el('div', { id: 'qr_sure', class: 'qr-sure' }),
      el('button', { id: 'qr_yeni', type: 'button', class: 'dugme ikincil kucuk', hidden: '' }, ['Yeni karekod']),
    ]);
    bolum.appendChild(p);
    document.getElementById('qr_yeni').addEventListener('click', () => { yenileme = 0; durdu = false; yeniKarekod(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tikla(); });
    // sekme (Giriş / Kayıt ol): karekod yalnız Giriş sekmesinde
    document.querySelectorAll('.sekmeler [data-kip]').forEach(b => b.addEventListener('click', () => setTimeout(gorunurlukGuncelle, 0)));
    gorunurlukGuncelle();
    tikla();   // karekod yalnız panel görünürken üretilir (giriş yapmış kullanıcıda hiç istenmez)
  }
  function gorunurlukGuncelle(){
    const p = document.getElementById('qr_panel'); if (!p) return;
    const kayit = document.querySelector('.sekmeler [data-kip="kayit"].aktif');
    p.hidden = !!kayit || !GENIS();
  }
  function panelGorunur(){ const p = document.getElementById('qr_panel'); return !!(p && !p.hidden && p.offsetParent !== null && !document.hidden); }

  function panelYaz(metinParcalari){
    const m = document.getElementById('qr_metin'); m.textContent = '';
    metinParcalari.forEach(x => m.appendChild(typeof x === 'string' ? document.createTextNode(x) : x));
  }
  async function yeniKarekod(){
    if (istekte) return;
    clearTimeout(zamanlayici); clearInterval(sayac);
    const kutu = document.getElementById('qr_kutu'); if (!kutu) return;
    document.getElementById('qr_yeni').hidden = true;
    kutu.classList.add('soluk');
    if (yenileme >= 5) { panelYaz(['Karekodun süresi doldu.']); document.getElementById('qr_sure').textContent = ''; document.getElementById('qr_yeni').hidden = false; pc = null; durdu = true; return; }
    yenileme++;
    let r;
    istekte = true;
    try { r = await cagir({ islem: 'baslat', cihaz: navigator.userAgent }); } catch (e) { r = { durum: 0, veri: {} }; }
    istekte = false;
    if (r.durum !== 200 || !r.veri.id) {
      pc = null; durdu = true; panelYaz(['Karekod şu an hazırlanamadı. E-posta ve şifrenle giriş yapabilirsin.']);
      document.getElementById('qr_sure').textContent = ''; document.getElementById('qr_yeni').hidden = false; return;
    }
    pc = { id: r.veri.id, gizli: r.veri.gizli, kod: r.veri.kod, bitis: Date.now() + (r.veri.sure || 120) * 1000 };
    kutu.textContent = ''; kutu.appendChild(qrSvg(location.origin + '/?qr=' + pc.id)); kutu.classList.remove('soluk');
    panelYaz(['Telefonunda bu siteye giriş yapmışsan kamerayla okut, sonra telefonda ', el('span', { class: 'qr-sayi', text: String(pc.kod) }), ' sayısını seç.']);
    sureYaz(); sayac = setInterval(sureYaz, 1000);
    zamanlayici = setTimeout(tikla, 2000);
  }
  function sureYaz(){
    if (!pc) return;
    const k = Math.max(0, Math.round((pc.bitis - Date.now()) / 1000));
    document.getElementById('qr_sure').textContent = 'Geçerlilik: ' + Math.floor(k / 60) + ':' + String(k % 60).padStart(2, '0');
  }
  async function tikla(){
    clearTimeout(zamanlayici);
    if (durdu || istekte) return;
    if (!panelGorunur()) { zamanlayici = setTimeout(tikla, 2000); return; }   // gizliyken sorma, beklemede kal
    if (!pc) { yeniKarekod(); return; }
    if (Date.now() > pc.bitis) { yeniKarekod(); return; }
    istekte = true;
    let r;
    try { r = await cagir({ islem: 'durum', id: pc.id, gizli: pc.gizli }); } catch (e) { r = { durum: 0, veri: {} }; }
    istekte = false;
    const d = r.veri.durum;
    if (d === 'onaylandi' && r.veri.token_hash) { await girisYap(r.veri.token_hash); return; }
    if (d === 'reddedildi') { C.mesaj('Telefonda onay verilmedi ya da yanlış sayı seçildi. Yeni karekod hazırlandı.', 'hata'); yenileme = 0; yeniKarekod(); return; }
    if (d === 'yok' || d === 'sure_doldu') { yeniKarekod(); return; }
    zamanlayici = setTimeout(tikla, 2000);
  }
  async function girisYap(th){
    clearInterval(sayac); pc = null; durdu = true;
    panelYaz(['Telefondan onaylandı, giriş yapılıyor…']); document.getElementById('qr_sure').textContent = '';
    qrIle = true;
    const { error } = await C.sb.auth.verifyOtp({ token_hash: th, type: 'magiclink' });
    if (error) {
      qrIle = false; durdu = false;
      C.mesaj('Karekodla giriş tamamlanamadı. Yeni karekodu okut ya da şifrenle giriş yap.', 'hata');
      yenileme = 0; yeniKarekod();
    }
    // başarılıysa SIGNED_IN → ana betik lisansaBak'ı çağırır
  }

  // ======================= TELEFON: onay ekranı =======================
  function onayBolumu(){
    let b = document.getElementById('bolum_qr');
    if (b) return b;
    b = el('section', { id: 'bolum_qr' });
    const yer = document.getElementById('bolum_form');
    yer.parentNode.insertBefore(b, yer.nextSibling);
    return b;
  }
  function adresiTemizle(){ try { const u = new URL(location.href); u.searchParams.delete('qr'); history.replaceState(history.state, '', u.pathname + u.search); } catch (e) {} }
  function devamDugmesi(metin){
    const d = el('button', { type: 'button', class: 'dugme ikincil tam' }, [metin || 'Bu telefonda siteye devam et']);
    d.addEventListener('click', () => { adresiTemizle(); location.reload(); });
    return d;
  }
  async function onayEkrani(oturum){
    stilEkle();
    C.goster('bolum_qr');
    const b = onayBolumu(); b.hidden = false; b.textContent = '';
    C.mesaj('');
    b.appendChild(el('h1', { text: 'Bilgisayarda giriş' }));
    const bekle = el('p', { class: 'aciklama', text: 'Karekod denetleniyor…' }); b.appendChild(bekle);
    let r;
    try { r = await cagir({ islem: 'bilgi', id: ADRES_QR }, oturum.access_token); } catch (e) { r = { durum: 0, veri: {} }; }
    if (r.durum !== 200) {
      bekle.textContent = r.durum === 404 ? 'Bu karekodun süresi dolmuş ya da kullanılmış. Bilgisayardaki yeni karekodu okut.' : 'Karekod şu an denetlenemedi. Biraz sonra yeniden okut.';
      b.appendChild(devamDugmesi()); adresiTemizle(); return;
    }
    const v = r.veri;
    bekle.textContent = 'Bilgisayarındaki giriş isteğini onaylamak için orada görünen sayıyı seç.';
    b.appendChild(el('div', { class: 'qr-cihaz' }, [
      'Hesap: ', el('b', { text: (oturum.user && oturum.user.email) || '' }), el('br'),
      'İsteyen: ', el('b', { text: cihazAdi(v.cihaz) }), ', ' + saat(v.olusma) + '’de',
    ]));
    const secenek = el('div', { class: 'qr-secenek', role: 'group', 'aria-label': 'Bilgisayardaki sayı' });
    (v.secenekler || []).forEach(n => {
      const d = el('button', { type: 'button', text: String(n) });
      d.addEventListener('click', () => onayla(n, oturum, b, secenek));
      secenek.appendChild(d);
    });
    b.appendChild(secenek);
    b.appendChild(el('p', { class: 'qr-uyari', text: 'Bu karekodu kendi bilgisayarında, cenkaltinay.com adresinde görmediysen hiçbir sayıyı seçme ve «Onaylama» de.' }));
    const red = el('button', { type: 'button', class: 'baglanti', text: 'Onaylama' });
    red.addEventListener('click', async () => {
      red.disabled = true;
      try { await cagir({ islem: 'reddet', id: ADRES_QR }, oturum.access_token); } catch (e) {}
      sonuc(b, 'Giriş isteği reddedildi.', 'bilgi');
    });
    b.appendChild(el('p', { class: 'alt-not' }, [red]));
  }
  async function onayla(n, oturum, b, secenek){
    secenek.querySelectorAll('button').forEach(x => x.disabled = true);
    let r;
    try { r = await cagir({ islem: 'onayla', id: ADRES_QR, kod: n }, oturum.access_token); } catch (e) { r = { durum: 0, veri: {} }; }
    if (r.durum === 200 && r.veri.tamam) return sonuc(b, 'Onaylandı. Bilgisayarda giriş yapılıyor; bu sayfayı kapatabilirsin.', 'tamam');
    if (r.veri.hata === 'kod') return sonuc(b, 'Sayı eşleşmedi; güvenlik için bu karekod iptal edildi. Bilgisayarda yeni karekod çıktı, onu okut.', 'hata');
    if (r.durum === 404) return sonuc(b, 'Bu karekodun süresi dolmuş. Bilgisayardaki yeni karekodu okut.', 'hata');
    sonuc(b, 'Onay şu an gönderilemedi. Bilgisayardaki karekodu yeniden okut.', 'hata');
  }
  function sonuc(b, metin, tur){
    adresiTemizle();
    b.textContent = '';
    b.appendChild(el('h1', { text: 'Bilgisayarda giriş' }));
    C.mesaj(metin, tur);
    b.appendChild(devamDugmesi());
  }

  // ======================= ana betiğin bağlantıları =======================
  window.QrGiris = {
    kur(ctx){
      C = ctx; stilEkle();
      if (ADRES_QR) {
        // telefonda okutuldu: oturum yoksa önce giriş (karekod paneli gösterilmez)
        C.sb.auth.getSession().then(({ data }) => {
          if (!data.session) C.mesaj('Bilgisayarındaki girişi onaylamak için önce bu telefonda giriş yap.', 'bilgi');
        });
        return;
      }
      panelKur();
      window.addEventListener('resize', gorunurlukGuncelle);
    },
    // lisansaBak'ın başında: telefon onay adresindeysek lisans akışı yerine onay ekranı
    yakala(oturum){
      if (!ADRES_QR || !C || !oturum) return false;
      if (!onayGosterildi) { onayGosterildi = true; onayEkrani(oturum); }
      return true;
    },
    qrIleGirildi(){ return qrIle; },
  };
})();
