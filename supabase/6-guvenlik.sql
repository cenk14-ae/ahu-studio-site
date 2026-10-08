-- Güvenlik sıkılaştırma (08.10.2026)
-- 1) Tetikleyici fonksiyonu dışarıdan (RPC) çağrılamasın; tetikleyici çalışmaya devam eder
revoke execute on function public.yeni_kullanici() from public, anon, authenticated;
-- 2) Arama yolu sabit (search_path enjeksiyonu)
alter function public.lisans_gecerli_mi(public.lisanslar) set search_path = public;
