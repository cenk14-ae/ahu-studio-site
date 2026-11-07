-- 19) YÖNETİCİ NOTU KULLANICIDAN GİZLİ (06.11.2026, G-0014 taslak 06; Cenk onayı 06.11.2026)
--     Durum: site (yonetim.html sütun listesi + not RPC'si) ile AYNI ANDA canlıya alınır: uygula.mjs --taslak 06 --site-hazir.
--     Bu dosya taslağın @@UYGULA bölümüdür (birebir); uygula.mjs onu tek istekte (tek örtük işlem) gönderdi.
--     SQL Editor'da da tek seferde çalıştırılır. Geri alma ve doğrulama sorguları iş klasöründe:
--     .ajan/isler/20261106-supabase-uygula/taslak/06-lisans-notlari-gizle.sql (+ .geri.sql).
--
--   G-0014 / taslak 06 — Yönetici notunu kullanıcıdan gizle (G-0013 S21). Kaynak: G-0013 duzeltme/06 (içerik aynı).
--   ÖN KOŞUL: yonetim.html:163 değişikliği (site-degisiklikleri.md §2) AYNI ANDA yayında olmalı; eski yonetim.html
--   `select('*')` bu SQL'den sonra «permission denied for column notlar» verir. uygula.mjs 06'yı yalnız
--   --site-hazir bayrağıyla uygular. Geri alma: 06-lisans-notlari-gizle.geri.sql.

create or replace function public.yonetici_lisans_notlari()
returns table (user_id uuid, notlar text)
language sql stable security definer set search_path = public as $$
  select l.user_id, l.notlar from public.lisanslar l where public.yonetici_mi();
$$;
revoke execute on function public.yonetici_lisans_notlari() from public, anon;
grant  execute on function public.yonetici_lisans_notlari() to authenticated;

revoke select on public.lisanslar from authenticated;
grant select (user_id, eposta, ad, firma, aktif, surum, bitis, olusturma, son_giris, programlar,
              aktif_oturum, oturum_zamani, oturum_cihaz, firma_id, demo, eposta_dogrulandi)
  on public.lisanslar to authenticated;
