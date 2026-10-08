// KULLANICI VERİSİ — YÜKLEYİCİ TARAFI (08.10.2026)
// Cenk: «her veri tutan program için ama veriler kullanıcı bazlı olsun, birbirlerininkini göremesinler».
//
// Programlar blob iframe'de AYNI kökende (site) çalışır → localStorage + IndexedDB hepsinde ortaktı.
// Çözüm iki parçalı, programların KENDİSİ DEĞİŞMEZ:
//  1) veri-katmani.js program HTML'ine gömülür: depolama adlarını <uid>:<program>: ad alanına çevirir.
//  2) Bu dosya (yükleyici penceresi, aynı köken) o ad alanının ANLIK GÖRÜNTÜSÜNÜ alır
//     (localStorage + ad alanlı IndexedDB veritabanlarının tamamı), gzip'ler ve Supabase'in özel
//     'kullanici-verisi' kovasına <uid>/<program>.json.gz olarak yazar (RLS: yalnız sahibi).
//     Açılışta program AÇILMADAN ÖNCE buluttaki daha yeniyse ad alanını ondan geri kurar.
// Çakışma: tek oturum aynı anda tek cihazı garanti eder → «son yazan kazanır».
// AHU Studio KAPSAM DIŞI: projeleri dosyaya kaydeder, ince istemcinin sunucu köprüsü Supabase
// belirtecini localStorage'dan okur (ad alanı onu gizlerdi).
(function () {
  'use strict';
  var KOVA = 'kullanici-verisi';
  var BEKLE_MS = 3000;            // son değişiklikten sonra buluta yazmadan önce beklenen süre
  var TEKRAR_MS = 30000;          // yükleme başarısızsa yeniden deneme
  var AZAMI_BAYT = 45 * 1024 * 1024;   // sıkıştırılmış görüntü bundan büyükse yüklenmez (kova sınırı 50 MB)
  var ATLA_IDB = ['keyval-store'];     // önbellek (Şartname'nin OCR dil dosyaları) — kullanıcı verisi değil

  // GEÇİŞ: ad alanı gelmeden önce programların kullandığı (ad alansız) anahtarlar.
  // Yalnız YÖNETİCİDE ve bulutta kayıt yokken bir kez kopyalanır; eski veri SİLİNMEZ.
  var ESKI = {
    lazer:    { onek: ['lazercrm.'], idb: ['lazercrm'] },
    order:    { ls: ['isEmriApp.state.v1'], idb: ['isEmri_bataryaPdf'] },
    hesap:    { ls: ['mekanik_tesisat_hesap_v1', 'bataryaFiyat_v3', 'excelHesaplari_v1', 'hesapFoyu_v1', 'hesapMerkezi_rapor_v1', 'otopark-f1'] },
    atolye:   { onek: ['atolye.'] },
    kontrol:  { onek: ['kt.v1.'] },
    nem:      { ls: ['buharNemlendirici_girdiler'] },
    cfd:      { ls: ['cfd-rapor-config'] },
    plan:     { ls: ['evAracPlani_v1'] },
    sukacagi: { ls: ['suKacagi_durum'] },
    uvc:      { ls: ['uvcLamba_v1'] },
    rtu:      { ls: ['rtu_cevrim_komplib_v1', 'rtu_cevrim_sema_v5', 'rtu_cevrim_sema_v5_kis', 'rtu_v10_sekme'] },
    bukum:    { ls: ['sacbukum.havuz.v1', 'sacbukum.firmalar.v1'] },
    sartname: { ls: ['sc-ai', 'sc-company', 'sc-ocr'] }
  };

  var KATMAN = null;   // veri-katmani.js metni (bir kez indirilir)

  // ================= yardımcılar =================
  function istek(r) { return new Promise(function (coz, red) { r.onsuccess = function () { coz(r.result); }; r.onerror = function () { red(r.error); }; }); }
  function zamanAsimi(p, ms, ne) { return Promise.race([p, new Promise(function (c, red) { setTimeout(function () { red(new Error(ne + ' zaman aşımı')); }, ms); })]); }
  function b64(buf) {
    var u = new Uint8Array(buf), s = '', P = 0x8000;
    for (var i = 0; i < u.length; i += P) s += String.fromCharCode.apply(null, u.subarray(i, i + P));
    return btoa(s);
  }
  function b64den(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  // Değişmeyen veriyi yeniden yüklememek için içerik özeti (http'de crypto.subtle yok → cyrb53)
  function ozet(s) {
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0, c; i < s.length; i++) { c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16) + (h1 >>> 0).toString(16) + ':' + s.length;
  }
  async function gzip(metin) { return await new Response(new Blob([metin]).stream().pipeThrough(new CompressionStream('gzip'))).blob(); }
  async function gzipAc(blob) {
    var bas = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
    if (bas[0] === 0x1f && bas[1] === 0x8b) return await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();
    return await blob.text();
  }

  // ---- yapısal klon değerlerini JSON'a (ve geri) — Blob/ArrayBuffer base64 olur
  var ETIKET = '\u0000vk';
  var DIZI_TURLERI = ['Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array', 'DataView'];
  function Atla(neden) { this.neden = neden; }
  async function kodla(v) {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
    if (typeof v === 'number') { if (isFinite(v)) return v; var o = {}; o[ETIKET] = 'N'; o.v = String(v); return o; }
    if (typeof v === 'undefined') { var u = {}; u[ETIKET] = 'U'; return u; }
    if (typeof v === 'bigint') { var bi = {}; bi[ETIKET] = 'BI'; bi.v = String(v); return bi; }
    if (typeof v !== 'object') throw new Atla(typeof v);
    var t = Object.prototype.toString.call(v).slice(8, -1), r = {};
    if (Array.isArray(v)) { var a = []; for (var i = 0; i < v.length; i++) a.push(await kodla(v[i])); return a; }
    if (t === 'Date') { r[ETIKET] = 'D'; r.v = v.getTime(); return r; }
    if (t === 'RegExp') { r[ETIKET] = 'R'; r.s = v.source; r.f = v.flags; return r; }
    if (t === 'Blob' || t === 'File') {
      r[ETIKET] = t === 'File' ? 'F' : 'B'; r.tip = v.type; r.v = b64(await v.arrayBuffer());
      if (t === 'File') { r.ad = v.name; r.son = v.lastModified; }
      return r;
    }
    if (t === 'ArrayBuffer') { r[ETIKET] = 'AB'; r.v = b64(v); return r; }
    if (DIZI_TURLERI.indexOf(t) >= 0) { r[ETIKET] = 'TA'; r.c = t; r.v = b64(v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength)); return r; }
    if (t === 'Map') { r[ETIKET] = 'M'; r.v = []; for (var e of v) r.v.push([await kodla(e[0]), await kodla(e[1])]); return r; }
    if (t === 'Set') { r[ETIKET] = 'S'; r.v = []; for (var s of v) r.v.push(await kodla(s)); return r; }
    if (t === 'Boolean' || t === 'Number' || t === 'String') { r[ETIKET] = 'K'; r.c = t; r.v = v.valueOf(); return r; }
    var pr = Object.getPrototypeOf(v);
    if (pr !== Object.prototype && pr !== null && t !== 'Object') throw new Atla(t);   // FileSystemHandle, CryptoKey…
    var d = {};
    for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) d[k] = await kodla(v[k]);
    if (Object.prototype.hasOwnProperty.call(v, ETIKET)) { r[ETIKET] = 'O'; r.v = d; return r; }
    return d;
  }
  function coz(v) {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(coz);
    var t = v[ETIKET];
    if (t === undefined) { var d = {}; for (var k in v) d[k] = coz(v[k]); return d; }
    switch (t) {
      case 'N': return Number(v.v);
      case 'U': return undefined;
      case 'BI': return BigInt(v.v);
      case 'D': return new Date(v.v);
      case 'R': return new RegExp(v.s, v.f);
      case 'B': return new Blob([b64den(v.v)], { type: v.tip || '' });
      case 'F': return new File([b64den(v.v)], v.ad || 'dosya', { type: v.tip || '', lastModified: v.son });
      case 'AB': return b64den(v.v).buffer;
      case 'TA': { var buf = b64den(v.v).buffer; var C = window[v.c]; return v.c === 'DataView' ? new DataView(buf) : new C(buf); }
      case 'M': return new Map(v.v.map(function (e) { return [coz(e[0]), coz(e[1])]; }));
      case 'S': return new Set(v.v.map(coz));
      case 'K': return v.c === 'Boolean' ? new Boolean(v.v) : v.c === 'Number' ? new Number(v.v) : new String(v.v);   // eslint-disable-line no-new-wrappers
      case 'O': { var o = {}; for (var q in v.v) o[q] = coz(v.v[q]); return o; }
    }
    return v;
  }

  // ================= IndexedDB oku / kur =================
  async function dbAdlari(onek) {
    if (!indexedDB.databases) return null;
    var l = await indexedDB.databases();
    return l.map(function (d) { return d.name; }).filter(function (n) { return typeof n === 'string' && n.indexOf(onek) === 0; });
  }
  async function dbVarMi(ad) {
    var l = indexedDB.databases ? await indexedDB.databases() : null;
    return l ? l.some(function (d) { return d.name === ad; }) : null;
  }
  // Bir veritabanının TAMAMI: şema + kayıtlar. Serileştirilemeyen kayıtlar atlanır ve listelenir.
  async function dbOku(gercekAd, kayitAdi, atlanan) {
    var db = await zamanAsimi(istek(indexedDB.open(gercekAd)), 8000, 'IndexedDB açma');
    db.onversionchange = function () { db.close(); };   // program yükseltirken bizim bağlantımız engel olmasın
    try {
      var adlar = Array.prototype.slice.call(db.objectStoreNames).sort(), depolar = [];
      if (!adlar.length) return { ad: kayitAdi, surum: db.version, depolar: [] };
      var tx = db.transaction(adlar, 'readonly'), ham = [];
      adlar.forEach(function (ad) {
        var os = tx.objectStore(ad), dep = { ad: ad, keyPath: os.keyPath, autoIncrement: os.autoIncrement, indexler: [], kayitlar: [] };
        Array.prototype.forEach.call(os.indexNames, function (n) { var ix = os.index(n); dep.indexler.push({ ad: n, keyPath: ix.keyPath, unique: ix.unique, multiEntry: ix.multiEntry }); });
        var c = os.openCursor();
        c.onsuccess = function () { var k = c.result; if (k) { ham.push([dep, k.primaryKey, k.value]); k.continue(); } };
        depolar.push(dep);
      });
      await new Promise(function (coz, red) { tx.oncomplete = coz; tx.onerror = function () { red(tx.error); }; tx.onabort = function () { red(tx.error); }; });
      for (var i = 0; i < ham.length; i++) {
        try { ham[i][0].kayitlar.push([await kodla(ham[i][1]), await kodla(ham[i][2])]); }
        catch (e) { if (e instanceof Atla) atlanan.push(kayitAdi + '/' + ham[i][0].ad + ': ' + e.neden); else throw e; }
      }
      return { ad: kayitAdi, surum: db.version, depolar: depolar };
    } finally { db.close(); }
  }
  async function dbSil(gercekAd) {
    await zamanAsimi(new Promise(function (coz, red) {
      var r = indexedDB.deleteDatabase(gercekAd);
      r.onsuccess = function () { coz(); }; r.onerror = function () { red(r.error); };
    }), 8000, 'IndexedDB silme');
  }
  async function dbKur(gercekAd, k) {
    await dbSil(gercekAd);
    var r = indexedDB.open(gercekAd, Math.max(1, k.surum || 1));
    r.onupgradeneeded = function () {
      var db = r.result;
      k.depolar.forEach(function (d) {
        var se = { autoIncrement: !!d.autoIncrement }; if (d.keyPath !== null && d.keyPath !== undefined) se.keyPath = d.keyPath;
        var os = db.createObjectStore(d.ad, se);
        (d.indexler || []).forEach(function (ix) { os.createIndex(ix.ad, ix.keyPath, { unique: !!ix.unique, multiEntry: !!ix.multiEntry }); });
      });
    };
    var db = await zamanAsimi(istek(r), 8000, 'IndexedDB kurma');
    try {
      var dolu = k.depolar.filter(function (d) { return d.kayitlar.length; });
      if (!dolu.length) return;
      var tx = db.transaction(dolu.map(function (d) { return d.ad; }), 'readwrite');
      dolu.forEach(function (d) {
        var os = tx.objectStore(d.ad), satir = d.keyPath !== null && d.keyPath !== undefined;
        d.kayitlar.forEach(function (kv) { if (satir) os.put(coz(kv[1])); else os.put(coz(kv[1]), coz(kv[0])); });
      });
      await new Promise(function (coz2, red) { tx.oncomplete = coz2; tx.onerror = function () { red(tx.error); }; tx.onabort = function () { red(tx.error); }; });
    } finally { db.close(); }
  }

  // ================= anlık görüntü =================
  function lsAnahtarlari(secici) { var a = []; for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k != null && secici(k)) a.push(k); } return a; }
  async function goruntuAl(ns, program) {
    var atlanan = [], ls = {};
    lsAnahtarlari(function (k) { return k.indexOf(ns) === 0; }).sort().forEach(function (k) { ls[k.slice(ns.length)] = localStorage.getItem(k); });
    var adlar = await dbAdlari(ns), idb = [];
    if (adlar) adlar.sort();
    for (var i = 0; adlar && i < adlar.length; i++) {
      var kisa = adlar[i].slice(ns.length);
      if (ATLA_IDB.indexOf(kisa) >= 0) continue;
      idb.push(await dbOku(adlar[i], kisa, atlanan));
    }
    return { bicim: 'altinay-kullanici-verisi', surum: 1, program: program, ls: ls, idb: idb, atlanan: atlanan };
  }
  async function yerelVarMi(ns) {
    if (lsAnahtarlari(function (k) { return k.indexOf(ns) === 0; }).length) return true;
    var adlar = await dbAdlari(ns);
    return !!(adlar && adlar.length);
  }
  async function geriKur(ns, g) {
    lsAnahtarlari(function (k) { return k.indexOf(ns) === 0; }).forEach(function (k) { localStorage.removeItem(k); });
    Object.keys(g.ls || {}).forEach(function (k) { localStorage.setItem(ns + k, g.ls[k]); });
    var gelen = (g.idb || []).map(function (d) { return ns + d.ad; });
    var var_ = await dbAdlari(ns) || [];
    for (var i = 0; i < var_.length; i++) if (gelen.indexOf(var_[i]) < 0 && ATLA_IDB.indexOf(var_[i].slice(ns.length)) < 0) await dbSil(var_[i]);
    for (var j = 0; j < (g.idb || []).length; j++) await dbKur(ns + g.idb[j].ad, g.idb[j]);
  }
  // Yönetici geçişi: ad alansız eski veri → ad alanı (eskisi yerinde kalır)
  async function eskiyiTasi(pid, ns) {
    var e = ESKI[pid]; if (!e) return 0;
    var sayi = 0;
    lsAnahtarlari(function (k) {
      if (k.indexOf(':') >= 0 && /^[0-9a-f-]{36}:/.test(k)) return false;   // başka ad alanı
      return (e.ls || []).indexOf(k) >= 0 || (e.onek || []).some(function (o) { return k.indexOf(o) === 0; });
    }).forEach(function (k) { localStorage.setItem(ns + k, localStorage.getItem(k)); sayi++; });
    for (var i = 0; i < (e.idb || []).length; i++) {
      var ad = e.idb[i];
      if (await dbVarMi(ad) === false) continue;
      var g = await dbOku(ad, ad, []);
      if (!g.depolar.length) continue;
      await dbKur(ns + ad, g); sayi++;
    }
    return sayi;
  }

  // ================= bulut + oturum =================
  var D = null;   // { sb, uid, pid, ns, yol, meta anahtarı, ... }
  var gosterge = null;
  function metaOku() { try { return JSON.parse(localStorage.getItem(D.metaK) || '{}') || {}; } catch (e) { return {}; } }
  function metaYaz(m) { try { localStorage.setItem(D.metaK, JSON.stringify(m)); } catch (e) { /* dolu */ } }
  function saat(t) { return new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }); }
  function durum(tur, metin) {
    if (!gosterge) return;
    gosterge.hidden = false;
    gosterge.dataset.durum = tur;
    gosterge.textContent = 'Bulut: ' + metin;
  }
  async function bulutBilgi() {
    var r = await D.sb.storage.from(KOVA).list(D.uid, { search: D.pid + '.json.gz', limit: 10 });
    if (r.error) throw r.error;
    var o = (r.data || []).filter(function (x) { return x.name === D.pid + '.json.gz'; })[0];
    return o ? { zaman: o.updated_at || o.created_at || '', boyut: o.metadata && o.metadata.size } : null;
  }
  async function bulutIndir() {
    var r = await D.sb.storage.from(KOVA).download(D.yol);
    if (r.error) throw r.error;
    return await gzipAc(r.data);
  }

  var bekleyen = null, yukleniyor = false, yeniden = false, tekrarSayac = null;
  function degisti() {
    if (!D) return;
    var m = metaOku(), n = Date.now();
    if (!m.kirli || n - (D.sonKirliYazim || 0) > 1000) { m.kirli = n; metaYaz(m); D.sonKirliYazim = n; }
    else D.kirliBekleyen = n;
    if (!yukleniyor) durum('bekliyor', 'kaydedilecek…');
    clearTimeout(bekleyen); bekleyen = setTimeout(yukle, BEKLE_MS);
  }
  async function yukle() {
    clearTimeout(bekleyen); bekleyen = null;
    if (!D) return;
    if (yukleniyor) { yeniden = true; return; }
    yukleniyor = true;
    var bas = Date.now();
    try {
      if (D.kirliBekleyen) { var m0 = metaOku(); m0.kirli = D.kirliBekleyen; metaYaz(m0); D.kirliBekleyen = 0; }
      var g = await goruntuAl(D.ns, D.pid);
      if (g.atlanan.length && !D.atlananBildirildi) { D.atlananBildirildi = true; console.info('[Bulut] serileştirilemeyen kayıtlar atlandı:', g.atlanan); }
      var json = JSON.stringify(g), oz = ozet(json);
      var m = metaOku();
      if (oz === m.ozet && m.esit) { if (!m.kirli || m.kirli <= bas) { m.kirli = 0; metaYaz(m); } durum('tamam', 'kaydedildi ' + saat(m.son || Date.now())); return; }
      durum('yukleniyor', 'kaydediliyor…');
      var gz = await gzip(json);
      if (gz.size > AZAMI_BAYT) { durum('hata', 'veri çok büyük (' + Math.round(gz.size / 1048576) + ' MB), buluta yazılmadı'); return; }
      var r = await D.sb.storage.from(KOVA).upload(D.yol, gz, { upsert: true, cacheControl: '0', contentType: 'application/gzip' });
      if (r.error) throw r.error;
      var bilgi = null; try { bilgi = await bulutBilgi(); } catch (e) { /* zaman yok: sonraki açılış yeniden karşılaştırır */ }
      m = metaOku();
      m.esit = bilgi ? bilgi.zaman : ''; m.son = Date.now(); m.ozet = oz;
      if (!m.kirli || m.kirli <= bas) m.kirli = 0;
      metaYaz(m);
      clearTimeout(tekrarSayac);
      durum('tamam', 'kaydedildi ' + saat(m.son));
    } catch (e) {
      console.warn('[Bulut] yazılamadı:', e && e.message || e);
      durum(navigator.onLine === false ? 'cevrimdisi' : 'hata', navigator.onLine === false ? 'çevrimdışı — veri bu cihazda, bağlantı gelince yazılır' : 'yazılamadı — yeniden denenecek');
      clearTimeout(tekrarSayac); tekrarSayac = setTimeout(function () { if (metaOku().kirli) yukle(); }, TEKRAR_MS);
    } finally {
      yukleniyor = false;
      if (yeniden) { yeniden = false; yukle(); }
    }
  }
  function simdiYaz() { if (D && (bekleyen || metaOku().kirli || D.kirliBekleyen)) yukle(); }

  // Program AÇILMADAN önce çağrılır: ad alanını hazırlar (gerekirse buluttan geri kurar / geçiş yapar)
  async function hazirla(o) {
    D = { sb: o.sb, uid: o.uid, pid: o.programId, ns: o.uid + ':' + o.programId + ':', yol: o.uid + '/' + o.programId + '.json.gz',
          metaK: 'vk_meta:' + o.uid + ':' + o.programId };
    gosterge = o.gosterge || null;
    window.__kullaniciVerisiDegisti = degisti;
    if (!KATMAN) {
      var yanit = await fetch(o.katmanAdresi || 'veri-katmani.js', { cache: 'no-cache' });
      if (!yanit.ok) throw new Error('veri-katmani.js alınamadı (' + yanit.status + ')');
      KATMAN = await yanit.text();
    }
    var t0 = performance.now(), rapor = { islem: 'yok' };
    var m = metaOku(), yerel = await yerelVarMi(D.ns), bulut;
    // Bulut okunamazsa program AÇILMAZ: boş açılıp ilk değişiklikte buluttaki veriyi ezmesin
    try { bulut = await bulutBilgi(); }
    catch (e) { durum('hata', 'okunamadı'); throw new Error('Bulut verin okunamadı (' + (e && e.message || e) + ').'); }
    if (!bulut) {
      if (!yerel && o.yonetici) {
        var n = 0; try { n = await eskiyiTasi(D.pid, D.ns); } catch (e) { console.warn('[Bulut] eski veri taşınamadı:', e); }
        if (n) { rapor.islem = 'gecis'; rapor.tasinan = n; yerel = true; }
      }
      if (yerel) { m.kirli = m.kirli || Date.now(); metaYaz(m); rapor.islem = rapor.islem === 'yok' ? 'ilk-yukleme' : rapor.islem; setTimeout(yukle, 1500); durum('bekliyor', 'kaydedilecek…'); }
      else durum('tamam', 'kayıt yok');
    } else if (bulut.zaman !== m.esit || !yerel) {
      // Bulut başka cihazda değişmiş (ya da bu cihazda veri yok)
      if (yerel && m.kirli && m.kirli > Date.parse(bulut.zaman)) { rapor.islem = 'yerel-daha-yeni'; setTimeout(yukle, 1500); durum('bekliyor', 'kaydedilecek…'); }
      else {
        var metin = await bulutIndir();
        var g = JSON.parse(metin);
        if (!g || g.bicim !== 'altinay-kullanici-verisi') throw new Error('Buluttaki kayıt tanınmadı.');
        await geriKur(D.ns, g);
        m.esit = bulut.zaman; m.kirli = 0; m.ozet = ozet(metin); m.son = Date.parse(bulut.zaman) || Date.now(); metaYaz(m);
        rapor.islem = 'buluttan';
        durum('tamam', 'buluttan alındı ' + saat(m.son));
      }
    } else if (m.kirli) { rapor.islem = 'bekleyen-yukleme'; setTimeout(yukle, 1500); durum('bekliyor', 'kaydedilecek…'); }
    else durum('tamam', 'güncel' + (m.son ? ' · ' + saat(m.son) : ''));
    rapor.ms = Math.round(performance.now() - t0);
    return rapor;
  }

  // Program HTML'ine katmanı gömer (<head>'in en başı; yoksa doctype'tan sonra)
  function gom(html) {
    if (!D || !KATMAN) return html;
    var etiket = '<scr' + 'ipt>window.__VK_AYAR=' + JSON.stringify({ ns: D.ns }) + ';\n' + KATMAN + '</scr' + 'ipt>';
    var m = /<head(\s[^>]*)?>/i.exec(html);
    if (m) return html.slice(0, m.index + m[0].length) + etiket + html.slice(m.index + m[0].length);
    m = /^\s*<!doctype[^>]*>/i.exec(html);
    if (m) return html.slice(0, m[0].length) + etiket + html.slice(m[0].length);
    return etiket + html;
  }

  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') simdiYaz(); });
  window.addEventListener('pagehide', simdiYaz);
  window.addEventListener('online', function () { if (D && metaOku().kirli) yukle(); });

  window.KullaniciVerisi = {
    KAPSAM_DISI: ['ahu'],
    hazirla: hazirla, gom: gom, simdiYaz: simdiYaz,
    // testler ve yönetim için
    _goruntuAl: goruntuAl, _durum: function () { return D ? { ns: D.ns, meta: metaOku(), yukleniyor: yukleniyor, bekliyor: !!bekleyen } : null; }
  };
})();
