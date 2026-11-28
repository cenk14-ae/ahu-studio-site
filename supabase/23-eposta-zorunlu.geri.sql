-- GERİ ALMA — 23-eposta-zorunlu.sql (28.11.2026). Yalnız eklenen RPC kaldırılır; doldurulmuş eposta_dogrulandi
-- damgaları KALIR (doğrulama gerçekten yapıldı). Site tarafı: index.js «E-POSTA ZORUNLU» bölümü RPC yoksa katmanda
-- «Doğrula» hata iletisi verir — geri alırken index.js'in önceki sürümü de yayınlanmalı.
begin;
drop function if exists public.eposta_kodu_dogrula(text);
commit;
