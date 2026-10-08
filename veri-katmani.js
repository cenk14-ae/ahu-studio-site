// KULLANICI VERİSİ — PROGRAMIN İÇİNDEKİ KATMAN (08.10.2026)
// Yükleyici (index.html → kullanici-verisi.js) bu dosyanın METNİNİ program HTML'inin <head>'inin en
// başına <script> olarak gömer; program betiklerinden ÖNCE koşar. Program DEĞİŞMEZ.
// Bütün programlar aynı kökende (blob belge = sitenin kökeni) çalıştığı için localStorage ve
// IndexedDB ortaktı: kullanıcılar ve programlar birbirinin verisini görüyordu. Bu katman:
//   · localStorage'ı ad alanlı (<uid>:<program>:) şeffaf bir Storage ile değiştirir
//   · indexedDB.open / deleteDatabase / databases adlarını aynı ad alanına çevirir
//   · her değişiklikte üst pencereye (yükleyici) haber verir — anlık görüntüyü yükleyici alır
//   · programın kendi açtığı srcdoc çerçevelerine (Hesap Merkezi, RTU) kendini yeniden gömer
// Ayar: window.__VK_AYAR = { ns: '<uid>:<program>:' } — yükleyici aynı <script>'in başına yazar.
// DİKKAT: bu dosyada kapanış script etiketi metni GEÇMEZ (srcdoc'a gömülürken belgeyi keserdi).
(function () {
  'use strict';
  var W = window;
  var KAYNAK = document.currentScript ? document.currentScript.textContent : '';
  var AYAR = W.__VK_AYAR;
  if (!AYAR || !AYAR.ns || W.__VK_KURULDU) return;
  W.__VK_KURULDU = true;
  var NS = String(AYAR.ns);

  function bildir(tur) {
    try { var t = W.top; if (t && t !== W && typeof t.__kullaniciVerisiDegisti === 'function') t.__kullaniciVerisiDegisti(tur); } catch (e) { /* üst pencere yok */ }
  }

  // ---------------- localStorage ----------------
  var gercek = null;
  try { gercek = W.localStorage; } catch (e) { gercek = null; }
  if (gercek) {
    var SP = Storage.prototype;
    var gI = SP.getItem, sI = SP.setItem, rI = SP.removeItem, kI = SP.key;
    var uzG = Object.getOwnPropertyDescriptor(SP, 'length').get;
    var anahtarlar = function () {
      var a = [], n = uzG.call(gercek);
      for (var i = 0; i < n; i++) { var k = kI.call(gercek, i); if (k != null && k.indexOf(NS) === 0) a.push(k.slice(NS.length)); }
      return a;
    };
    var api = {
      getItem: function (k) { return gI.call(gercek, NS + String(k)); },
      setItem: function (k, v) { sI.call(gercek, NS + String(k), String(v)); bildir('ls'); },
      removeItem: function (k) { var ad = NS + String(k); if (gI.call(gercek, ad) !== null) { rI.call(gercek, ad); bildir('ls'); } },
      clear: function () { var a = anahtarlar(); for (var i = 0; i < a.length; i++) rI.call(gercek, NS + a[i]); if (a.length) bildir('ls'); },
      key: function (i) { var a = anahtarlar(); i = Number(i) | 0; return i >= 0 && i < a.length ? a[i] : null; }
    };
    var sahip = Object.prototype.hasOwnProperty;
    var vekil = new Proxy(Object.create(SP), {
      get: function (t, p) {
        if (typeof p === 'symbol') return p === Symbol.toStringTag ? 'Storage' : undefined;
        if (p === 'length') return anahtarlar().length;
        if (sahip.call(api, p)) return api[p];
        if (p === 'constructor') return Storage;
        if (p in Object.prototype) return Object.prototype[p];
        var v = api.getItem(p); return v === null ? undefined : v;
      },
      set: function (t, p, v) { if (typeof p !== 'symbol') api.setItem(p, v); return true; },
      has: function (t, p) { return typeof p !== 'symbol' && (sahip.call(api, p) || p === 'length' || api.getItem(p) !== null); },
      deleteProperty: function (t, p) { if (typeof p !== 'symbol') api.removeItem(p); return true; },
      ownKeys: function () { return anahtarlar(); },
      getOwnPropertyDescriptor: function (t, p) {
        if (typeof p === 'symbol') return undefined;
        var v = api.getItem(p);
        return v === null ? undefined : { value: v, writable: true, enumerable: true, configurable: true };
      },
      defineProperty: function (t, p, d) { if (typeof p !== 'symbol') api.setItem(p, d && d.value); return true; }
    });
    try { Object.defineProperty(W, 'localStorage', { configurable: true, enumerable: true, get: function () { return vekil; } }); }
    catch (e) { /* tanımlanamazsa: Storage.prototype yolu da aynı ad alanına çevrilir (aşağıda) */ }
    // Storage.prototype.getItem.call(localStorage, …) gibi doğrudan çağrılar ve defineProperty başarısızsa
    // gerçek nesneye giden çağrılar da ad alanına düşsün
    SP.getItem = function (k) { return this === gercek ? api.getItem(k) : gI.call(this, k); };
    SP.setItem = function (k, v) { return this === gercek ? api.setItem(k, v) : sI.call(this, k, v); };
    SP.removeItem = function (k) { return this === gercek ? api.removeItem(k) : rI.call(this, k); };
    SP.key = function (i) { return this === gercek ? api.key(i) : kI.call(this, i); };
    var spClear = SP.clear;
    SP.clear = function () { return this === gercek ? api.clear() : spClear.call(this); };
  }

  // ---------------- IndexedDB ----------------
  if (W.indexedDB && W.IDBFactory) {
    var FP = IDBFactory.prototype;
    var acA = FP.open, silA = FP.deleteDatabase, listeA = FP.databases;
    FP.open = function (ad, surum) {
      var r = (arguments.length > 1 && surum !== undefined) ? acA.call(this, NS + String(ad), surum) : acA.call(this, NS + String(ad));
      var yukseltme = false;
      try {
        r.addEventListener('upgradeneeded', function () { yukseltme = true; });
        r.addEventListener('success', function () { if (yukseltme) bildir('idb'); });
      } catch (e) { /* yok say */ }
      return r;
    };
    FP.deleteDatabase = function (ad) {
      var r = silA.call(this, NS + String(ad));
      try { r.addEventListener('success', function () { bildir('idb'); }); } catch (e) { /* yok say */ }
      return r;
    };
    if (listeA) FP.databases = function () {
      return listeA.call(this).then(function (l) {
        return (l || []).filter(function (d) { return d && typeof d.name === 'string' && d.name.indexOf(NS) === 0; })
          .map(function (d) { return { name: d.name.slice(NS.length), version: d.version }; });
      });
    };
    if (W.IDBDatabase) {
      var DP = IDBDatabase.prototype;
      var adD = Object.getOwnPropertyDescriptor(DP, 'name');
      if (adD && adD.get) Object.defineProperty(DP, 'name', { configurable: true, enumerable: adD.enumerable,
        get: function () { var n = adD.get.call(this); return typeof n === 'string' && n.indexOf(NS) === 0 ? n.slice(NS.length) : n; } });
      var txA = DP.transaction;
      DP.transaction = function (depolar, kip) {
        var tx = txA.apply(this, arguments);
        if (kip === 'readwrite' || kip === 'versionchange') { try { tx.addEventListener('complete', function () { bildir('idb'); }); } catch (e) { /* yok say */ } }
        return tx;
      };
    }
  }

  // ---------------- programın kendi srcdoc çerçeveleri ----------------
  // Hesap Merkezi ve RTU araçlarını srcdoc çerçevesinde açar; o çerçevelerin kendi localStorage'ı vardır.
  // Katman aynı ayarla onların başına da gömülür.
  function gom(html) {
    html = String(html);
    if (!KAYNAK || html.indexOf('__VK_AYAR') >= 0) return html;
    var etiket = '<scr' + 'ipt>' + KAYNAK + '</scr' + 'ipt>';
    var m = /<head(\s[^>]*)?>/i.exec(html);
    if (m) return html.slice(0, m.index + m[0].length) + etiket + html.slice(m.index + m[0].length);
    m = /^\s*<!doctype[^>]*>/i.exec(html);
    if (m) return html.slice(0, m[0].length) + etiket + html.slice(m[0].length);
    return etiket + html;
  }
  if (W.HTMLIFrameElement) {
    var IP = HTMLIFrameElement.prototype, sdD = Object.getOwnPropertyDescriptor(IP, 'srcdoc');
    if (sdD && sdD.set) Object.defineProperty(IP, 'srcdoc', { configurable: true, enumerable: sdD.enumerable, get: sdD.get,
      set: function (v) { sdD.set.call(this, gom(v)); } });
    var saA = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (n, v) {
      if (this instanceof HTMLIFrameElement && String(n).toLowerCase() === 'srcdoc') v = gom(v);
      return saA.call(this, n, v);
    };
  }
})();
