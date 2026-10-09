// ============================================================================
// ALTINAY — SANTRAL KÜTÜPHANESİ (yükleyici tarafı) · 09.10.2026
// Cenk: «AHU Studio kullanıcıları kütüphane oluşturabilsin, klasör yapısında; aynı firmada
// çalışanların ortak kütüphanesi olsun, ben hepsine erişebileyim. Normal çalışmaları sunucuda
// durmayacak — yalnız kütüphaneler sunucuda durur.»
//
// Kütüphane kaydı = TEK SANTRAL (AHU nesnesinin tamamı). Kapsamlar: Kişisel · Firma.
// Veri + kurallar Supabase'de (supabase/7-kutuphane.sql, RLS); burası yalnız arayüzdür.
//
// KÖPRÜ (AHU Studio'nun 3B Tasarım çerçevesi f0 ile, window.top üzerinden doğrudan):
//   f0 → burası : kutuphaneVarMi (el sıkışma) · kutuphaneAc {santraller[], aktif, surum, isNo}
//                 kutuphaneEklendi {id, ad | hata}
//   burası → f0 : kutuphaneHazir (f0 Kütüphane düğmesini gösterir) · kutuphaneEkle {id, santral, surum}
// Yalnız AYNI KÖKENDEN ve program çerçevesinin (#uygulama) içinden gelen mesaj kabul edilir.
// Program çevrimdışı açılınca (index.html dosyadan) yükleyici yoktur → düğme hiç görünmez.
// ============================================================================
(function () {
  'use strict';
  const BOYUT_SINIR = 2 * 1024 * 1024;      // veritabanındaki kısıtın aynısı (octet_length ≤ 2 MB)
  const COP_GUN = 30;
  const COP = '__cop__';
  let AY = null;               // { sb, uid, yonetici, cerceve }
  let f0 = null;               // AHU Studio 3B Tasarım penceresi (son el sıkışan)
  let dinleyici = false;
  let baglam = null;           // kutuphane_baglam()
  let kut = null;              // { kapsam, sahip, ad }
  let klasorler = [], kayitlar = [];
  let acik = null;             // açık klasör id'si (null = kök, COP = çöp kutusu)
  let arama = '';
  let proje = null;            // f0'dan: { santraller, aktif, surum, isNo }
  let kapali = new Set();      // ağaçta kapalı klasörler
  const bekleyen = {};
  let $ = null;

  // ---------------------------------------------------------------- yardımcılar
  const kac = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const trSirala = (a, b) => String(a.ad).localeCompare(String(b.ad), 'tr', { numeric: true, sensitivity: 'base' });
  const kucuk = s => String(s || '').toLocaleLowerCase('tr');
  function tarih(s) {
    if (!s) return '—';
    const d = new Date(s);
    return d.toLocaleDateString('tr-TR') + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  }
  function hataMetni(e) {
    const m = (e && (e.message || e.error_description || e.hint)) || String(e);
    if (/row-level security|permission denied|violates row/i.test(m)) return 'Bu kütüphaneye erişim iznin yok (lisans, AHU izni ya da oturum).';
    if (/veri_check/.test(m)) return 'Santral çok büyük — kütüphane kaydı en fazla 2 MB olabilir.';
    if (/_ad_check|ad_uzunluk/.test(m)) return 'Ad boş olamaz ve çok uzun olmamalı.';
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Bağlantı yok — internet bağlantını kontrol et.';
    return m;
  }

  // Santral özeti: modül sayısı, seri, malzeme, montajın dış ölçüsü (U × G × Y)
  //   x → uzunluk (L), z → genişlik (W), y → yükseklik (H)  — AHU Studio'nun eksen sözleşmesi
  function ozet(s) {
    const mods = (s && Array.isArray(s.modules)) ? s.modules : [];
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    mods.forEach(m => {
      const p = m && m.pos || {}, x = +p.x || 0, y = +p.y || 0, z = +p.z || 0;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x + (+m.L || 0));
      y0 = Math.min(y0, y); y1 = Math.max(y1, y + (+m.H || 0));
      z0 = Math.min(z0, z); z1 = Math.max(z1, z + (+m.W || 0));
    });
    const o = {
      santral: String(s && s.ad || ''),
      modul: mods.length,
      seri: String(s && s.varsayimlar && s.varsayimlar.seri || ''),
      malzeme: String(s && s.malzeme || ''),
      L: mods.length ? Math.round(x1 - x0) : 0,
      W: mods.length ? Math.round(z1 - z0) : 0,
      H: mods.length ? Math.round(y1 - y0) : 0
    };
    if (s && +s.adet > 1) o.adet = +s.adet;
    const adlar = mods.map(m => m && m.ad).filter(Boolean).slice(0, 12).map(String);
    if (adlar.length) o.moduller = adlar;
    return o;
  }
  function ozetMetni(o) {
    if (!o) return '';
    const p = [];
    p.push((o.modul || 0) + ' modül');
    if (o.seri) p.push('Seri ' + o.seri);
    if (o.malzeme) p.push(o.malzeme === 'paslanmaz' ? 'Paslanmaz' : o.malzeme === 'galvaniz' ? 'Galvaniz' : o.malzeme);
    if (o.L || o.W || o.H) p.push((o.L || 0) + ' × ' + (o.W || 0) + ' × ' + (o.H || 0) + ' mm');
    if (o.adet > 1) p.push(o.adet + ' adet');
    return p.join(' · ');
  }

  // ---------------------------------------------------------------- köprü
  function programdan(w) {
    try {
      const hedef = AY && AY.cerceve && AY.cerceve.contentWindow;
      let x = w;
      for (let i = 0; i < 6 && x; i++) {
        if (x === hedef) return true;
        if (x.parent === x) break;
        x = x.parent;
      }
    } catch (e) { /* */ }
    return false;
  }
  function dinle(e) {
    if (!AY || e.origin !== location.origin || !e.data || typeof e.data.type !== 'string') return;
    if (e.data.type.indexOf('kutuphane') !== 0 || !programdan(e.source)) return;
    const t = e.data.type;
    if (t === 'kutuphaneVarMi') { f0 = e.source; try { f0.postMessage({ type: 'kutuphaneHazir' }, location.origin); } catch (x) { /* */ } }
    else if (t === 'kutuphaneAc') { f0 = e.source; ac(e.data); }
    else if (t === 'kutuphaneEklendi') { const r = bekleyen[e.data.id]; if (r) { delete bekleyen[e.data.id]; r(e.data); } }
  }
  function f0aEkle(santral, surum) {
    return new Promise((coz, red) => {
      if (!f0) return red(new Error('AHU Studio bulunamadı — programı yeniden aç.'));
      const id = 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      const sure = setTimeout(() => { delete bekleyen[id]; red(new Error('AHU Studio yanıt vermedi.')); }, 15000);
      bekleyen[id] = d => { clearTimeout(sure); d.hata ? red(new Error(d.hata)) : coz(d); };
      try { f0.postMessage({ type: 'kutuphaneEkle', id, santral, surum }, location.origin); }
      catch (e) { clearTimeout(sure); delete bekleyen[id]; red(e); }
    });
  }

  // ---------------------------------------------------------------- arayüz iskeleti
  const CSS = `
  .kut-perde{position:fixed;inset:0;z-index:40;background:rgba(5,7,10,.62);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:16px}
  .kut-perde[hidden]{display:none}
  .kut-kart{width:min(1120px,100%);height:min(740px,100%);background:var(--bg-1);border:1px solid var(--line-2);border-radius:12px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 64px -16px rgba(0,0,0,.6);color:var(--t-1);font-size:13.5px}
  .kut-ust{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--line)}
  .kut-ust b{font-size:15px;font-weight:600;white-space:nowrap;margin-right:4px}
  .kut-ust select{width:auto;min-width:180px;max-width:300px;padding:6px 8px;font-size:13px}
  .kut-ust input{flex:1;min-width:120px;padding:6px 10px;font-size:13px}
  .kut-x{background:none;border:0;color:var(--t-2);font-size:22px;line-height:1;cursor:pointer;padding:2px 6px;border-radius:6px}
  .kut-x:hover{background:var(--bg-3);color:var(--t-1)}
  .kut-govde{flex:1;display:flex;min-height:0}
  .kut-agac{width:250px;flex:none;border-right:1px solid var(--line);overflow:auto;padding:8px 6px}
  .kut-dugum{display:flex;align-items:center;gap:4px;padding:5px 6px;border-radius:6px;cursor:pointer;color:var(--t-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;user-select:none}
  .kut-dugum:hover{background:var(--bg-2);color:var(--t-1)}
  .kut-dugum.secili{background:var(--accent-soft);color:var(--t-1)}
  .kut-dugum.birak{outline:2px dashed var(--accent);outline-offset:-2px}
  .kut-dugum .ok{width:14px;flex:none;text-align:center;color:var(--t-3);font-size:10px}
  .kut-dugum .ad{overflow:hidden;text-overflow:ellipsis}
  .kut-dugum.cop{margin-top:10px;border-top:1px solid var(--line);border-radius:0;padding-top:9px}
  .kut-sag{flex:1;display:flex;flex-direction:column;min-width:0}
  .kut-yol{display:flex;align-items:center;gap:6px;padding:10px 14px;border-bottom:1px solid var(--line);flex-wrap:wrap}
  .kut-yol .parca{color:var(--t-2);cursor:pointer;background:none;border:0;font:inherit;padding:2px 4px;border-radius:4px}
  .kut-yol .parca:hover{color:var(--t-1);background:var(--bg-2)}
  .kut-yol .parca.son{color:var(--t-1);font-weight:600;cursor:default}
  .kut-yol .ayrac{color:var(--t-4)}
  .kut-yol .bosluk{flex:1}
  .kut-kaydet{display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--bg-2);border-bottom:1px solid var(--line);flex-wrap:wrap}
  .kut-kaydet span{color:var(--t-2);font-size:12.5px}
  .kut-kaydet select{width:auto;max-width:220px;padding:6px 8px;font-size:13px}
  .kut-kaydet input{flex:1;min-width:160px;padding:6px 10px;font-size:13px}
  .kut-liste{flex:1;overflow:auto;padding:6px 8px 12px}
  .kut-satir{display:flex;align-items:center;gap:10px;padding:8px 8px;border-radius:8px;border:1px solid transparent}
  .kut-satir:hover{background:var(--bg-2)}
  .kut-satir.birak{border-color:var(--accent);background:var(--accent-soft)}
  .kut-satir[draggable=true]{cursor:grab}
  .kut-ikon{width:30px;height:30px;flex:none;border-radius:7px;display:flex;align-items:center;justify-content:center;background:var(--bg-3);color:var(--t-2)}
  .kut-ikon.santral{background:var(--accent-soft);color:var(--accent-2)}
  .kut-ikon svg{width:17px;height:17px}
  .kut-bilgi{flex:1;min-width:0}
  .kut-bilgi .ad{font-weight:500;color:var(--t-1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .kut-bilgi .ad.tik{cursor:pointer}
  .kut-bilgi .ad.tik:hover{text-decoration:underline}
  .kut-bilgi .alt{color:var(--t-3);font-size:12px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .kut-bilgi .ozet{color:var(--t-2);font-size:12px;margin-top:2px}
  .kut-eylem{display:flex;gap:4px;flex:none;opacity:.85}
  .kut-satir:hover .kut-eylem{opacity:1}
  .kut-d{background:var(--bg-3);border:1px solid var(--line-2);color:var(--t-1);border-radius:6px;padding:5px 9px;font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}
  .kut-d:hover{background:var(--bg-4)}
  .kut-d.ana{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:600}
  .kut-d.ana:hover{filter:brightness(1.1)}
  .kut-d.tehlike{color:var(--danger)}
  .kut-d:disabled{opacity:.5;cursor:default}
  .kut-bos{color:var(--t-3);text-align:center;padding:40px 10px;font-size:13px;line-height:1.6}
  .kut-baslik2{color:var(--t-3);font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;padding:10px 8px 4px}
  .kut-mesaj{padding:0 14px;font-size:12.5px;min-height:0}
  .kut-mesaj:not(:empty){padding:9px 14px;border-top:1px solid var(--line)}
  .kut-mesaj.hata{color:var(--danger)} .kut-mesaj.tamam{color:var(--ok)} .kut-mesaj.bilgi{color:var(--t-2)}
  .kut-diyalog{position:fixed;inset:0;z-index:41;display:flex;align-items:center;justify-content:center;background:rgba(5,7,10,.5);padding:16px}
  .kut-diyalog[hidden]{display:none}
  .kut-dkart{width:min(440px,100%);max-height:min(560px,100%);display:flex;flex-direction:column;background:var(--bg-1);border:1px solid var(--line-3);border-radius:10px;padding:18px;gap:10px}
  .kut-dkart h3{font-size:15px;font-weight:600}
  .kut-dkart p{color:var(--t-2);font-size:13px;line-height:1.5}
  .kut-dkart input,.kut-dkart select{padding:8px 10px;font-size:13.5px}
  .kut-secim{overflow:auto;border:1px solid var(--line-2);border-radius:8px;padding:4px;max-height:320px}
  .kut-secim label{display:flex;align-items:center;gap:8px;margin:0;padding:6px 8px;border-radius:6px;font-size:13px;color:var(--t-1);cursor:pointer}
  .kut-secim label:hover{background:var(--bg-2)}
  .kut-secim input{width:auto}
  .kut-dalt{display:flex;justify-content:flex-end;gap:8px;margin-top:4px}
  .kut-tost{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:42;background:var(--bg-3);border:1px solid var(--line-3);color:var(--t-1);padding:9px 16px;border-radius:99px;font-size:13px;box-shadow:0 10px 30px -10px rgba(0,0,0,.6)}
  @media (max-width:760px){
    .kut-govde{flex-direction:column}
    .kut-agac{width:auto;max-height:30%;border-right:0;border-bottom:1px solid var(--line)}
    .kut-ust{flex-wrap:wrap} .kut-ust input{order:5;flex-basis:100%}
    .kut-satir{flex-wrap:wrap} .kut-eylem{flex-wrap:wrap}
  }`;
  const IK = {
    klasor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>',
    santral: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>'
  };

  function iskelet() {
    if ($) return;
    const st = document.createElement('style'); st.id = 'kut-stil'; st.textContent = CSS; document.head.appendChild(st);
    const d = document.createElement('div');
    d.innerHTML =
      '<div class="kut-perde" id="kut" hidden>' +
      ' <div class="kut-kart" role="dialog" aria-modal="true" aria-labelledby="kut_baslik">' +
      '  <div class="kut-ust"><b id="kut_baslik">Santral Kütüphanesi</b>' +
      '   <select id="kut_sec" title="Kütüphane"></select>' +
      '   <input id="kut_ara" type="search" placeholder="Ada göre ara (bütün klasörlerde)" autocomplete="off">' +
      '   <button class="kut-x" id="kut_kapat" type="button" aria-label="Kapat" title="Kapat (Esc)">×</button></div>' +
      '  <div class="kut-govde"><nav class="kut-agac" id="kut_agac" aria-label="Klasörler"></nav>' +
      '   <section class="kut-sag"><div class="kut-yol" id="kut_yol"></div>' +
      '    <div class="kut-kaydet" id="kut_kaydet"></div>' +
      '    <div class="kut-liste" id="kut_liste"></div></section></div>' +
      '  <div class="kut-mesaj" id="kut_mesaj" role="status"></div>' +
      ' </div>' +
      '</div>' +
      '<div class="kut-diyalog" id="kut_diyalog" hidden><div class="kut-dkart" role="dialog" aria-modal="true" id="kut_dkart"></div></div>';
    while (d.firstChild) document.body.appendChild(d.firstChild);
    const g = id => document.getElementById(id);
    $ = { perde: g('kut'), sec: g('kut_sec'), ara: g('kut_ara'), kapat: g('kut_kapat'), agac: g('kut_agac'), yol: g('kut_yol'),
      kaydet: g('kut_kaydet'), liste: g('kut_liste'), mesaj: g('kut_mesaj'), diyalog: g('kut_diyalog'), dkart: g('kut_dkart') };

    $.kapat.addEventListener('click', kapat);
    $.perde.addEventListener('mousedown', e => { if (e.target === $.perde) kapat(); });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || $.perde.hidden) return;
      if (!$.diyalog.hidden) return;   // diyalog kendi Esc'ini işler
      kapat();
    });
    $.sec.addEventListener('change', () => {
      const k = (baglam && baglam.kutuphaneler || [])[+$.sec.value];
      if (!k) return;
      kut = k; acik = null; arama = ''; $.ara.value = '';
      try { localStorage.setItem('kut_son', k.kapsam + ':' + k.sahip); } catch (e) { /* */ }
      yukle();
    });
    $.ara.addEventListener('input', () => { arama = $.ara.value.trim(); ciz(); });
    $.agac.addEventListener('click', e => {
      const n = e.target.closest('.kut-dugum'); if (!n) return;
      if (e.target.closest('.ok') && n.dataset.id) {
        const id = n.dataset.id; kapali.has(id) ? kapali.delete(id) : kapali.add(id); agacCiz(); return;
      }
      git(n.dataset.cop ? COP : (n.dataset.id || null));
    });
    $.yol.addEventListener('click', e => {
      const p = e.target.closest('[data-git]'); if (p) return git(p.dataset.git || null);
      const b = e.target.closest('[data-is]'); if (b && b.dataset.is === 'klasor') yeniKlasor();
    });
    $.kaydet.addEventListener('click', e => { if (e.target.closest('#kut_kaydet_d')) kaydet(); });
    $.kaydet.addEventListener('change', e => { if (e.target.id === 'kut_kaynak') varsayilanAd(); });
    $.kaydet.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'kut_kayit_ad') kaydet(); });
    $.liste.addEventListener('click', listeTik);
    $.liste.addEventListener('dblclick', e => {
      const s = e.target.closest('.kut-satir'); if (!s || e.target.closest('button')) return;
      if (s.dataset.tur === 'klasor' && acik !== COP) git(s.dataset.id);
    });
    // SÜRÜKLE-BIRAK: satır → ağaçtaki klasör ya da listedeki klasör satırı
    const surukle = (kap) => {
      kap.addEventListener('dragstart', e => {
        const s = e.target.closest('[draggable=true]'); if (!s) return;
        e.dataTransfer.setData('text/plain', JSON.stringify({ tur: s.dataset.tur, id: s.dataset.id }));
        e.dataTransfer.effectAllowed = 'move';
      });
      kap.addEventListener('dragover', e => {
        const h = hedefEl(e.target); if (!h) return;
        e.preventDefault(); e.dataTransfer.dropEffect = 'move'; h.classList.add('birak');
      });
      kap.addEventListener('dragleave', e => { const h = hedefEl(e.target); if (h) h.classList.remove('birak'); });
      kap.addEventListener('drop', e => {
        const h = hedefEl(e.target); if (!h) return;
        e.preventDefault(); h.classList.remove('birak');
        let v; try { v = JSON.parse(e.dataTransfer.getData('text/plain')); } catch (x) { return; }
        if (!v || !v.id) return;
        tasi(v.tur, v.id, h.dataset.id || null);
      });
    };
    surukle($.agac); surukle($.liste);
  }
  // Bırakma hedefi: ağaçtaki klasör düğümü (çöp hariç) ya da listedeki klasör satırı (çöp görünümünde değil)
  function hedefEl(t) {
    const n = t.closest && t.closest('.kut-dugum');
    if (n && !n.dataset.cop) return n;
    const s = t.closest && t.closest('.kut-satir[data-tur=klasor]');
    if (s && acik !== COP) return s;
    return null;
  }

  function mesaj(m, tur) { if (!$) return; $.mesaj.textContent = m || ''; $.mesaj.className = 'kut-mesaj' + (m ? ' ' + (tur || 'bilgi') : ''); }
  function tost(m) {
    const t = document.createElement('div'); t.className = 'kut-tost'; t.textContent = m; t.setAttribute('role', 'status');
    document.body.appendChild(t); setTimeout(() => t.remove(), 3500);
  }

  // ---------------------------------------------------------------- diyalog
  function diyalog(o) {
    return new Promise(coz => {
      const k = $.dkart;
      k.innerHTML = '<h3>' + kac(o.baslik) + '</h3>' + (o.metin ? '<p>' + kac(o.metin) + '</p>' : '') +
        (o.girdi !== undefined ? '<input id="kut_dgirdi" maxlength="' + (o.uzunluk || 160) + '" value="' + kac(o.girdi) + '">' : '') +
        (o.html || '') +
        '<div class="kut-dalt"><button type="button" class="kut-d" data-c="0">Vazgeç</button>' +
        '<button type="button" class="kut-d ' + (o.tehlike ? 'tehlike' : 'ana') + '" data-c="1">' + kac(o.tamam || 'Tamam') + '</button></div>';
      $.diyalog.hidden = false;
      const g = k.querySelector('#kut_dgirdi');
      (g || k.querySelector('[data-c="1"]')).focus(); if (g) g.select();
      function bitir(v) { $.diyalog.hidden = true; k.innerHTML = ''; document.removeEventListener('keydown', tus, true); coz(v); }
      function deger() {
        if (g) { const v = g.value.trim(); if (!v) { g.focus(); return undefined; } return v; }
        const r = k.querySelector('input[type=radio]:checked'); if (r) return r.value;
        const s = k.querySelector('select'); if (s) return s.value;
        return true;
      }
      function tus(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); bitir(null); }
        else if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') { e.preventDefault(); const v = deger(); if (v !== undefined) bitir(v); }
      }
      document.addEventListener('keydown', tus, true);
      k.onclick = e => {
        const b = e.target.closest('[data-c]'); if (!b) return;
        if (b.dataset.c === '0') return bitir(null);
        const v = deger(); if (v !== undefined) bitir(v);
      };
      $.diyalog.onmousedown = e => { if (e.target === $.diyalog) bitir(null); };
    });
  }

  // ---------------------------------------------------------------- açma / yükleme
  async function ac(d) {
    iskelet();
    proje = {
      santraller: Array.isArray(d.santraller) ? d.santraller : [],
      aktif: +d.aktif || 0, surum: +d.surum || null, isNo: String(d.isNo || '')
    };
    $.perde.hidden = false; mesaj('Kütüphane yükleniyor…');
    $.liste.innerHTML = ''; $.agac.innerHTML = ''; $.yol.innerHTML = ''; $.kaydet.innerHTML = '';
    AY.sb.rpc('kutuphane_temizle').then(function () {}, function () {});   // 30 günü dolan çöp
    try {
      const { data, error } = await AY.sb.rpc('kutuphane_baglam');
      if (error) throw error;
      baglam = data;
    } catch (e) { mesaj('Kütüphane açılamadı: ' + hataMetni(e), 'hata'); return; }
    const L = baglam.kutuphaneler || [];
    if (!baglam.erisim || !L.length) {
      $.liste.innerHTML = '<div class="kut-bos">Kütüphane için geçerli bir AHU Studio lisansı gerekir.</div>'; mesaj(''); return;
    }
    // açılır liste: yöneticide gruplu
    if (baglam.yonetici) {
      const grup = (baslik, kapsam) => '<optgroup label="' + kac(baslik) + '">' + L.map((k, i) => k.kapsam !== kapsam ? '' :
        '<option value="' + i + '">' + kac(kapsam === 'kisi' ? (k.ad + (k.sahip === baglam.uid ? ' (sen)' : '')) : k.ad) + '</option>').join('') + '</optgroup>';
      $.sec.innerHTML = grup('Firmalar', 'firma') + grup('Kişisel kütüphaneler', 'kisi');
    } else {
      $.sec.innerHTML = L.map((k, i) => '<option value="' + i + '">' + kac(k.kapsam === 'firma' ? 'Firma: ' + k.ad : 'Kişisel') + '</option>').join('');
    }
    let son = null; try { son = localStorage.getItem('kut_son'); } catch (e) { /* */ }
    let i = L.findIndex(k => (k.kapsam + ':' + k.sahip) === son);
    if (i < 0) i = L.findIndex(k => k.kapsam === 'kisi' && k.sahip === baglam.uid);
    if (i < 0) i = 0;
    $.sec.value = String(i);
    if (!kut || (kut.kapsam + ':' + kut.sahip) !== (L[i].kapsam + ':' + L[i].sahip)) { acik = null; kapali = new Set(); }
    kut = L[i];
    arama = ''; $.ara.value = '';
    await yukle();
    $.ara.focus();
  }
  function kapat() { if ($) { $.perde.hidden = true; $.diyalog.hidden = true; } }

  async function yukle() {
    const k = kut; if (!k) return;
    mesaj('Yükleniyor…');
    try {
      const [a, b] = await Promise.all([
        AY.sb.from('kutuphane_klasor').select('id,ust_id,ad,olusturan_ad,olusturma,guncelleme,silindi,silen_ad,silme_kok')
          .eq('kapsam', k.kapsam).eq('sahip', k.sahip).limit(5000),
        AY.sb.from('kutuphane_kayit').select('id,klasor_id,ad,ozet,surum,olusturan_ad,olusturma,guncelleyen_ad,guncelleme,silindi,silen_ad,silme_kok')
          .eq('kapsam', k.kapsam).eq('sahip', k.sahip).limit(5000)
      ]);
      if (a.error) throw a.error;
      if (b.error) throw b.error;
      if (k !== kut) return;   // bu arada başka kütüphane seçildi
      klasorler = a.data || []; kayitlar = b.data || [];
      if (acik && acik !== COP && !klasorler.some(x => x.id === acik && !x.silindi)) acik = null;
      mesaj(''); ciz();
    } catch (e) { mesaj('Kütüphane okunamadı: ' + hataMetni(e), 'hata'); }
  }

  // ---------------------------------------------------------------- çizim
  const canliK = () => klasorler.filter(x => !x.silindi);
  const canliS = () => kayitlar.filter(x => !x.silindi);
  function yolu(id) {   // kökten klasöre zincir
    const z = [], gor = new Set(); let x = klasorler.find(k => k.id === id);
    while (x && !gor.has(x.id)) { gor.add(x.id); z.unshift(x); x = klasorler.find(k => k.id === x.ust_id); }
    return z;
  }
  function kutAdi() { return kut ? (kut.kapsam === 'firma' ? kut.ad : (baglam.yonetici && kut.sahip !== baglam.uid ? 'Kişisel — ' + kut.ad : 'Kişisel')) : ''; }
  function git(id) { acik = id; arama = ''; if ($.ara.value) $.ara.value = ''; mesaj(''); ciz(); }
  function ciz() { agacCiz(); yolCiz(); kaydetCiz(); listeCiz(); }

  function agacCiz() {
    const K = canliK(), cocuk = {};
    K.forEach(k => { (cocuk[k.ust_id || ''] = cocuk[k.ust_id || ''] || []).push(k); });
    Object.values(cocuk).forEach(a => a.sort(trSirala));
    const dal = (ust, derin) => (cocuk[ust] || []).map(k => {
      const var_ = (cocuk[k.id] || []).length, kap = kapali.has(k.id);
      return '<div class="kut-dugum' + (acik === k.id ? ' secili' : '') + '" data-id="' + kac(k.id) + '" style="padding-left:' + (6 + derin * 14) + 'px" title="' + kac(k.ad) + '">' +
        '<span class="ok">' + (var_ ? (kap ? '▸' : '▾') : '') + '</span><span class="ad">' + kac(k.ad) + '</span></div>' +
        (var_ && !kap ? dal(k.id, derin + 1) : '');
    }).join('');
    const copSay = klasorler.filter(x => x.silme_kok && x.silindi).length + kayitlar.filter(x => x.silme_kok && x.silindi).length;
    $.agac.innerHTML = '<div class="kut-dugum' + (acik === null ? ' secili' : '') + '" data-id="" title="' + kac(kutAdi()) + '"><span class="ok"></span><span class="ad"><b>' + kac(kutAdi()) + '</b></span></div>' +
      dal('', 1) +
      '<div class="kut-dugum cop' + (acik === COP ? ' secili' : '') + '" data-cop="1"><span class="ok"></span><span class="ad">Çöp kutusu' + (copSay ? ' (' + copSay + ')' : '') + '</span></div>';
  }
  function yolCiz() {
    let h = '';
    if (arama) h = '<span class="parca son">“' + kac(arama) + '” araması</span>';
    else if (acik === COP) h = '<span class="parca son">Çöp kutusu</span><span class="ufak" style="color:var(--t-3);font-size:12px">— silinenler ' + COP_GUN + ' gün sonra kalıcı olarak silinir</span>';
    else {
      const z = acik ? yolu(acik) : [];
      h = '<button type="button" class="parca' + (z.length ? '' : ' son') + '" data-git="">' + kac(kutAdi()) + '</button>' +
        z.map((k, i) => '<span class="ayrac">/</span><button type="button" class="parca' + (i === z.length - 1 ? ' son' : '') + '" data-git="' + kac(k.id) + '">' + kac(k.ad) + '</button>').join('');
    }
    h += '<span class="bosluk"></span>';
    if (acik !== COP && !arama) h += '<button type="button" class="kut-d" data-is="klasor">+ Yeni klasör</button>';
    $.yol.innerHTML = h;
  }
  function kaydetCiz() {
    if (acik === COP || !proje || !proje.santraller.length) { $.kaydet.hidden = true; $.kaydet.innerHTML = ''; return; }
    $.kaydet.hidden = false;
    const yer = acik ? (yolu(acik).slice(-1)[0] || {}).ad : kutAdi();
    const onceki = document.getElementById('kut_kaynak');
    const secili = onceki ? +onceki.value : proje.aktif;
    const ad = document.getElementById('kut_kayit_ad');
    const adDeger = ad ? ad.value : null;
    $.kaydet.innerHTML = '<span>Projeden kaydet:</span>' +
      '<select id="kut_kaynak" title="Kaydedilecek santral">' + proje.santraller.map((s, i) =>
        '<option value="' + i + '"' + (i === secili ? ' selected' : '') + '>' + kac(s && s.ad || ('Santral ' + (i + 1))) + '</option>').join('') + '</select>' +
      '<input id="kut_kayit_ad" maxlength="160" placeholder="Kütüphanedeki adı">' +
      '<button type="button" class="kut-d ana" id="kut_kaydet_d" title="Santrali «' + kac(yer) + '» içine kaydeder">Buraya kaydet</button>';
    if (adDeger !== null) document.getElementById('kut_kayit_ad').value = adDeger; else varsayilanAd();
  }
  function varsayilanAd() {
    const s = proje.santraller[+document.getElementById('kut_kaynak').value];
    document.getElementById('kut_kayit_ad').value = (proje.isNo ? proje.isNo + ' — ' : '') + (s && s.ad || 'Santral');
  }

  function satirKlasor(k, yolMetni) {
    const icerik = canliK().filter(x => x.ust_id === k.id).length + canliS().filter(x => x.klasor_id === k.id).length;
    return '<div class="kut-satir" draggable="true" data-tur="klasor" data-id="' + kac(k.id) + '">' +
      '<span class="kut-ikon">' + IK.klasor + '</span>' +
      '<div class="kut-bilgi"><div class="ad tik" data-is="ac">' + kac(k.ad) + '</div>' +
      '<div class="alt">' + (yolMetni ? kac(yolMetni) + ' · ' : '') + icerik + ' öğe · ' + kac(k.olusturan_ad || '—') + ' · ' + tarih(k.olusturma) + '</div></div>' +
      '<div class="kut-eylem"><button type="button" class="kut-d" data-is="adlandir">Yeniden adlandır</button>' +
      '<button type="button" class="kut-d" data-is="tasi">Taşı</button>' +
      '<button type="button" class="kut-d tehlike" data-is="sil">Sil</button></div></div>';
  }
  function satirSantral(s, yolMetni) {
    const kim = s.guncelleyen_ad && s.guncelleyen_ad !== s.olusturan_ad
      ? kac(s.olusturan_ad || '—') + ' kaydetti · ' + kac(s.guncelleyen_ad) + ' güncelledi'
      : kac(s.olusturan_ad || '—');
    const yeni = proje && proje.surum && s.surum && s.surum > proje.surum;
    return '<div class="kut-satir" draggable="true" data-tur="kayit" data-id="' + kac(s.id) + '">' +
      '<span class="kut-ikon santral">' + IK.santral + '</span>' +
      '<div class="kut-bilgi"><div class="ad" title="' + kac(s.ad) + '">' + kac(s.ad) + '</div>' +
      '<div class="ozet">' + kac(ozetMetni(s.ozet)) + (s.ozet && s.ozet.santral && s.ozet.santral !== s.ad ? ' · santral adı ' + kac(s.ozet.santral) : '') + '</div>' +
      '<div class="alt" title="' + kac(s.ozet && s.ozet.moduller ? 'Modüller: ' + s.ozet.moduller.join(', ') : '') + '">' + (yolMetni ? kac(yolMetni) + ' · ' : '') + kim + ' · ' + tarih(s.guncelleme || s.olusturma) +
        (yeni ? ' · <span style="color:var(--warn)">programın daha yeni bir sürümüyle kaydedilmiş</span>' : '') + '</div></div>' +
      '<div class="kut-eylem"><button type="button" class="kut-d ana" data-is="ekle" title="Bu santrali açık projeye yeni santral olarak ekler">Projeye ekle</button>' +
      '<button type="button" class="kut-d" data-is="adlandir">Yeniden adlandır</button>' +
      '<button type="button" class="kut-d" data-is="tasi">Taşı</button>' +
      '<button type="button" class="kut-d" data-is="uzerine" title="İçeriği projedeki seçili santralle değiştirir">Üzerine kaydet</button>' +
      ((baglam.kutuphaneler || []).length > 1 ? '<button type="button" class="kut-d" data-is="kopyala" title="Başka bir kütüphaneye kopyalar">Kopyala</button>' : '') +
      '<button type="button" class="kut-d tehlike" data-is="sil">Sil</button></div></div>';
  }
  function satirCop(tur, x) {
    const kalan = Math.max(0, COP_GUN - Math.floor((Date.now() - new Date(x.silindi).getTime()) / 86400000));
    return '<div class="kut-satir" data-tur="' + tur + '" data-id="' + kac(x.id) + '">' +
      '<span class="kut-ikon' + (tur === 'kayit' ? ' santral' : '') + '">' + (tur === 'kayit' ? IK.santral : IK.klasor) + '</span>' +
      '<div class="kut-bilgi"><div class="ad">' + kac(x.ad) + '</div>' +
      '<div class="alt">' + (tur === 'klasor' ? 'Klasör (içindekilerle) · ' : (x.ozet ? kac(ozetMetni(x.ozet)) + ' · ' : '')) +
        'silen ' + kac(x.silen_ad || '—') + ' · ' + tarih(x.silindi) + ' · ' + kalan + ' gün kaldı</div></div>' +
      '<div class="kut-eylem"><button type="button" class="kut-d ana" data-is="geri">Geri al</button>' +
      (baglam.yonetici ? '<button type="button" class="kut-d tehlike" data-is="kalici">Kalıcı sil</button>' : '') + '</div></div>';
  }
  function listeCiz() {
    let h = '';
    if (arama) {
      const q = kucuk(arama);
      const yk = k => { const z = yolu(k); return z.length ? kutAdi() + ' / ' + z.map(x => x.ad).join(' / ') : kutAdi(); };
      const K = canliK().filter(k => kucuk(k.ad).includes(q)).sort(trSirala);
      const S = canliS().filter(s => kucuk(s.ad).includes(q) || kucuk(s.ozet && s.ozet.santral).includes(q)).sort(trSirala);
      h = (K.length ? '<div class="kut-baslik2">Klasörler</div>' + K.map(k => satirKlasor(k, yk(k.ust_id))).join('') : '') +
          (S.length ? '<div class="kut-baslik2">Santraller</div>' + S.map(s => satirSantral(s, yk(s.klasor_id))).join('') : '');
      if (!h) h = '<div class="kut-bos">“' + kac(arama) + '” ile eşleşen klasör ya da santral yok.</div>';
    } else if (acik === COP) {
      const K = klasorler.filter(x => x.silme_kok && x.silindi), S = kayitlar.filter(x => x.silme_kok && x.silindi);
      const hepsi = K.map(x => ['klasor', x]).concat(S.map(x => ['kayit', x])).sort((a, b) => String(b[1].silindi).localeCompare(String(a[1].silindi)));
      h = hepsi.map(a => satirCop(a[0], a[1])).join('') ||
        '<div class="kut-bos">Çöp kutusu boş.<br>Silinen klasör ve santraller burada ' + COP_GUN + ' gün durur, geri alınabilir.</div>';
    } else {
      const K = canliK().filter(k => (k.ust_id || null) === acik).sort(trSirala);
      const S = canliS().filter(s => (s.klasor_id || null) === acik).sort(trSirala);
      h = K.map(k => satirKlasor(k)).join('') + S.map(s => satirSantral(s)).join('');
      if (!h) h = '<div class="kut-bos">Bu klasör boş.<br>' + (proje && proje.santraller.length
        ? 'Yukarıdan projedeki bir santrali buraya kaydedebilir, «Yeni klasör» ile alt klasör açabilirsin.'
        : 'Alt klasör açabilir, santralleri sürükleyip bırakarak taşıyabilirsin.') + '</div>';
    }
    $.liste.innerHTML = h;
  }

  // ---------------------------------------------------------------- işlemler
  async function islem(fn, basari) {
    mesaj('');
    try { await fn(); if (basari) mesaj(basari, 'tamam'); await yukle(); if (basari) mesaj(basari, 'tamam'); }
    catch (e) { mesaj(hataMetni(e), 'hata'); }
  }
  const kh = r => { if (r && r.error) throw r.error; return r && r.data; };

  async function yeniKlasor() {
    const ad = await diyalog({ baslik: 'Yeni klasör', metin: acik ? '«' + (yolu(acik).slice(-1)[0] || {}).ad + '» içine' : kutAdi() + ' kökünde', girdi: '', uzunluk: 120, tamam: 'Oluştur' });
    if (!ad) return;
    await islem(async () => kh(await AY.sb.from('kutuphane_klasor').insert({ kapsam: kut.kapsam, sahip: kut.sahip, ust_id: acik, ad })), 'Klasör oluşturuldu: ' + ad);
  }

  async function kaydet() {
    if (!proje || !proje.santraller.length) return;
    const i = +document.getElementById('kut_kaynak').value;
    const s = proje.santraller[i];
    const ad = document.getElementById('kut_kayit_ad').value.trim();
    if (!ad) { mesaj('Kütüphanedeki adı yaz.', 'hata'); document.getElementById('kut_kayit_ad').focus(); return; }
    if (!s || !Array.isArray(s.modules)) { mesaj('Santral okunamadı.', 'hata'); return; }
    const boyut = new Blob([JSON.stringify(s)]).size;
    if (boyut > BOYUT_SINIR) { mesaj('Santral çok büyük (' + Math.round(boyut / 1024) + ' KB) — kütüphane kaydı en fazla 2 MB olabilir.', 'hata'); return; }
    const ayni = canliS().find(x => (x.klasor_id || null) === acik && kucuk(x.ad) === kucuk(ad));
    if (ayni) {
      const c = await diyalog({ baslik: 'Aynı adla kayıt var', metin: 'Bu klasörde «' + ayni.ad + '» zaten var. Yeni bir kayıt olarak yine de eklensin mi? (İçeriği değiştirmek için o satırdaki «Üzerine kaydet»i kullan.)', tamam: 'Yine de ekle' });
      if (!c) return;
    }
    const b = document.getElementById('kut_kaydet_d'); if (b) b.disabled = true;
    await islem(async () => kh(await AY.sb.from('kutuphane_kayit').insert({
      kapsam: kut.kapsam, sahip: kut.sahip, klasor_id: acik, ad, veri: s, ozet: ozet(s), surum: proje.surum
    })), '«' + ad + '» kütüphaneye kaydedildi.');
    const b2 = document.getElementById('kut_kaydet_d'); if (b2) b2.disabled = false;
  }

  function bul(tur, id) { return (tur === 'klasor' ? klasorler : kayitlar).find(x => x.id === id); }

  async function listeTik(e) {
    const b = e.target.closest('[data-is]'); if (!b) return;
    const s = b.closest('.kut-satir'); if (!s) return;
    const tur = s.dataset.tur, id = s.dataset.id, x = bul(tur, id); if (!x) return;
    const tablo = tur === 'klasor' ? 'kutuphane_klasor' : 'kutuphane_kayit';
    switch (b.dataset.is) {
      case 'ac': if (acik !== COP) git(id); break;
      case 'ekle': return projeyeEkle(x, b);
      case 'adlandir': {
        const ad = await diyalog({ baslik: 'Yeniden adlandır', girdi: x.ad, uzunluk: tur === 'klasor' ? 120 : 160, tamam: 'Kaydet' });
        if (!ad || ad === x.ad) return;
        return islem(async () => kh(await AY.sb.from(tablo).update({ ad }).eq('id', id)), 'Adı değişti: ' + ad);
      }
      case 'tasi': {
        const hedef = await klasorSec(tur, x);
        if (hedef === null) return;
        return tasi(tur, id, hedef || null);
      }
      case 'uzerine': {
        if (!proje || !proje.santraller.length) return;
        const sel = document.getElementById('kut_kaynak');
        const i = sel ? +sel.value : proje.aktif, kaynak = proje.santraller[i];
        if (!kaynak) return;
        const c = await diyalog({ baslik: 'Üzerine kaydet', tehlike: true, tamam: 'Üzerine kaydet',
          metin: '«' + x.ad + '» kaydının içeriği projedeki «' + (kaynak.ad || 'Santral') + '» santraliyle değiştirilecek. Eski içerik geri getirilemez.' });
        if (!c) return;
        const boyut = new Blob([JSON.stringify(kaynak)]).size;
        if (boyut > BOYUT_SINIR) { mesaj('Santral çok büyük — kütüphane kaydı en fazla 2 MB olabilir.', 'hata'); return; }
        return islem(async () => kh(await AY.sb.from('kutuphane_kayit').update({ veri: kaynak, ozet: ozet(kaynak), surum: proje.surum }).eq('id', id)),
          '«' + x.ad + '» güncellendi.');
      }
      case 'kopyala': {
        const L = baglam.kutuphaneler || [];
        const html = '<select id="kut_dsec">' + L.map((k, i) => (k.kapsam === kut.kapsam && k.sahip === kut.sahip) ? '' :
          '<option value="' + i + '">' + kac(k.kapsam === 'firma' ? 'Firma: ' + k.ad : (baglam.yonetici && k.sahip !== baglam.uid ? 'Kişisel — ' + k.ad : 'Kişisel')) + '</option>').join('') + '</select>';
        const v = await diyalog({ baslik: 'Başka kütüphaneye kopyala', metin: '«' + x.ad + '» seçilen kütüphanenin köküne kopyalanır.', html, tamam: 'Kopyala' });
        if (v === null || v === undefined) return;
        const hedefK = L[+v]; if (!hedefK) return;
        return islem(async () => {
          const r = kh(await AY.sb.from('kutuphane_kayit').select('veri,ozet,surum').eq('id', id).single());
          kh(await AY.sb.from('kutuphane_kayit').insert({ kapsam: hedefK.kapsam, sahip: hedefK.sahip, klasor_id: null, ad: x.ad, veri: r.veri, ozet: r.ozet, surum: r.surum }));
        }, '«' + x.ad + '» kopyalandı → ' + (hedefK.kapsam === 'firma' ? hedefK.ad : 'Kişisel'));
      }
      case 'sil': {
        const c = await diyalog({ baslik: tur === 'klasor' ? 'Klasörü sil' : 'Santrali sil', tehlike: true, tamam: 'Çöp kutusuna taşı',
          metin: '«' + x.ad + '»' + (tur === 'klasor' ? ' ve içindeki her şey' : '') + ' çöp kutusuna taşınacak. ' + COP_GUN + ' gün içinde geri alınabilir.' });
        if (!c) return;
        return islem(async () => kh(await AY.sb.rpc('kutuphane_sil', { p_tur: tur, p_id: id })), '«' + x.ad + '» çöp kutusuna taşındı.');
      }
      case 'geri':
        return islem(async () => kh(await AY.sb.rpc('kutuphane_geri_al', { p_tur: tur, p_id: id })), '«' + x.ad + '» geri alındı.');
      case 'kalici': {
        const c = await diyalog({ baslik: 'Kalıcı olarak sil', tehlike: true, tamam: 'Kalıcı sil', metin: '«' + x.ad + '»' + (tur === 'klasor' ? ' ve içindekiler' : '') + ' kalıcı olarak silinecek. Bu geri alınamaz.' });
        if (!c) return;
        return islem(async () => {
          const r = kh(await AY.sb.from(tablo).delete().eq('id', id).select('id'));
          if (!r || !r.length) throw new Error('Silinemedi (yalnız yönetici kalıcı silebilir).');
        }, '«' + x.ad + '» kalıcı olarak silindi.');
      }
    }
  }

  // Taşıma hedefi seçimi: klasör ağacı (klasör kendi alt ağacına taşınamaz — sunucu da denetler)
  async function klasorSec(tur, x) {
    const yasak = new Set();
    if (tur === 'klasor') {
      const yig = [x.id];
      while (yig.length) { const id = yig.pop(); yasak.add(id); canliK().forEach(k => { if (k.ust_id === id) yig.push(k.id); }); }
    }
    const simdiki = tur === 'klasor' ? (x.ust_id || '') : (x.klasor_id || '');
    const cocuk = {}; canliK().forEach(k => { (cocuk[k.ust_id || ''] = cocuk[k.ust_id || ''] || []).push(k); });
    Object.values(cocuk).forEach(a => a.sort(trSirala));
    const sat = (id, ad, derin, dis) => '<label style="padding-left:' + (8 + derin * 16) + 'px' + (dis ? ';opacity:.45' : '') + '"><input type="radio" name="kut_hedef" value="' + kac(id) + '"' +
      (id === simdiki ? ' checked' : '') + (dis ? ' disabled' : '') + '>' + IK.klasor.replace('<svg ', '<svg width="15" height="15" ') + ' ' + kac(ad) + '</label>';
    const dal = (ust, derin) => (cocuk[ust] || []).map(k => sat(k.id, k.ad, derin, yasak.has(k.id)) + (yasak.has(k.id) ? '' : dal(k.id, derin + 1))).join('');
    const html = '<div class="kut-secim">' + sat('', kutAdi() + ' (kök)', 0, false) + dal('', 1) + '</div>';
    const v = await diyalog({ baslik: 'Taşı: ' + x.ad, html, tamam: 'Taşı' });
    if (v === null || v === true) return null;
    if (v === simdiki) return null;
    return v;
  }

  async function tasi(tur, id, hedef) {
    const x = bul(tur, id); if (!x) return;
    if (tur === 'klasor' && hedef) {
      let y = klasorler.find(k => k.id === hedef), gor = new Set();
      while (y && !gor.has(y.id)) { if (y.id === id) { mesaj('Klasör kendi içine (ya da alt klasörüne) taşınamaz.', 'hata'); return; } gor.add(y.id); y = klasorler.find(k => k.id === y.ust_id); }
    }
    const simdiki = tur === 'klasor' ? (x.ust_id || null) : (x.klasor_id || null);
    if ((hedef || null) === simdiki) return;
    const alan = tur === 'klasor' ? { ust_id: hedef } : { klasor_id: hedef };
    const hedefAd = hedef ? ((klasorler.find(k => k.id === hedef) || {}).ad || '') : kutAdi();
    await islem(async () => kh(await AY.sb.from(tur === 'klasor' ? 'kutuphane_klasor' : 'kutuphane_kayit').update(alan).eq('id', id)),
      '«' + x.ad + '» taşındı → ' + hedefAd);
  }

  async function projeyeEkle(x, b) {
    b.disabled = true; mesaj('«' + x.ad + '» getiriliyor…');
    try {
      const r = kh(await AY.sb.from('kutuphane_kayit').select('veri,surum').eq('id', x.id).single());
      const d = await f0aEkle(r.veri, r.surum);
      kapat();
      tost('«' + d.ad + '» projeye eklendi.');
    } catch (e) { mesaj('Eklenemedi: ' + hataMetni(e), 'hata'); }
    finally { b.disabled = false; }
  }

  // ---------------------------------------------------------------- dışa açılan
  window.Kutuphane = {
    // index.html çağırır: AHU Studio açılmadan ÖNCE (el sıkışma program açılırken gelir)
    kur(o) {
      AY = { sb: o.sb, uid: o.uid, yonetici: !!o.yonetici, cerceve: o.cerceve };
      if (!dinleyici) { window.addEventListener('message', dinle); dinleyici = true; }
    },
    kapat,
    ozet, ozetMetni,       // test için
    _ac: ac                // test için
  };
})();
