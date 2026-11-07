-- 15) YETKİ SIKILAŞTIRMA (06.11.2026, G-0014 taslak 01; Cenk onayı 06.11.2026)
--     Durum: canlıya uygulandı 06.11.2026 14:35 (uygula.mjs --taslak 1,2,4).
--     Bu dosya taslağın @@UYGULA bölümüdür (birebir); uygula.mjs onu tek istekte (tek örtük işlem) gönderdi.
--     SQL Editor'da da tek seferde çalıştırılır. Geri alma ve doğrulama sorguları iş klasöründe:
--     .ajan/isler/20261106-supabase-uygula/taslak/01-yetki-sikilastirma.sql (+ .geri.sql).
--
--   G-0014 / taslak 01 — Yetki sıkılaştırma (G-0013 YENİ-1, YENİ-2). Kaynak: G-0013 duzeltme/01 (içerik aynı).
--   Biçim (uygula.mjs okur): @@ON_KOSUL / @@DOGRULA / @@GERI_DOGRULA bölümleri tek SELECT, tek satır,
--   `tamam` boolean sütunu döndürür (salt okunur çalışır). @@UYGULA tek istekte gönderilir (çok ifadeli basit
--   sorgu = tek örtük işlem; PostgreSQL 17 belgesi «Multiple Statements in a Simple Query», protocol-flow.html). Geri alma: 01-yetki-sikilastirma.geri.sql.

revoke execute on function public.benim_firmam()                       from public, anon;
grant  execute on function public.benim_firmam()                       to authenticated;
revoke execute on function public.lisans_gecerli_mi(public.lisanslar)  from public, anon;
grant  execute on function public.lisans_gecerli_mi(public.lisanslar)  to authenticated;
revoke truncate, references, trigger, maintain on all tables in schema public from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger, maintain on tables from anon, authenticated;
