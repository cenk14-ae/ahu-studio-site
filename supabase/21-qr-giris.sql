-- ============================================================================
-- AHU Studio — 21. adım: KAREKODLA GİRİŞ (12.11.2026)
-- Cenk: «pc'de siteyi açınca telefondan okutup girsek».
--
-- Akış (Edge Function `qr-giris`, supabase/functions/qr-giris/index.ts):
--   1) Bilgisayar (oturumsuz) «baslat» → bu tabloya bir satır: id (karekoda girer), gizli_ozet (yalnız bilgisayar
--      gizliyi bilir; bekleme sorgusu bununla), kod (bilgisayar ekranında görünen 2 haneli eşleşme sayısı), 2 dk süre.
--   2) Telefon (giriş yapmış) karekodu okutur → https://cenkaltinay.com/?qr=<id> → bilgisayar ekranındaki sayıyı seçip onaylar.
--      Fonksiyon telefonun belirtecini Auth'a sordurur (kim?), satırı «onaylandi» yapar ve o kullanıcı için tek kullanımlık
--      giriş belirteci (generate_link magiclink → hashed_token) üretip satıra yazar. Yanlış sayı → satır «reddedildi».
--   3) Bilgisayar «durum» (id + gizli) → onaylandıysa belirteci BİR KEZ alır, satır SİLİNİR; sb.auth.verifyOtp ile oturum açar
--      ve olağan lisans / tek oturum akışına girer.
--
-- Erişim: tabloya yalnız service_role (Edge Function) dokunur — anon / authenticated için hiçbir izin ve RLS kuralı yok.
-- Belirteç (hashed_token) yalnız onay ile alma arasında (en çok 2 dk) durur; alınınca satır silinir, süresi geçen satırlar
-- her «baslat» çağrısında temizlenir.
-- ============================================================================

create table if not exists public.qr_girisleri (
  id           uuid primary key default gen_random_uuid(),
  gizli_ozet   text not null,                                  -- sha256(bilgisayarın gizlisi), hex
  kod          smallint not null check (kod between 10 and 99), -- ekranda eşleşme sayısı
  cihaz        text,                                           -- bilgisayarın tarayıcı bilgisi (telefonda gösterilir)
  durum        text not null default 'bekliyor' check (durum in ('bekliyor', 'onaylandi', 'reddedildi')),
  user_id      uuid references auth.users(id) on delete cascade,
  token_hash   text,
  olusma       timestamptz not null default now(),
  bitis        timestamptz not null default now() + interval '2 minutes'
);
create index if not exists qr_girisleri_bitis on public.qr_girisleri (bitis);
create index if not exists qr_girisleri_olusma on public.qr_girisleri (olusma);

alter table public.qr_girisleri enable row level security;
revoke all on public.qr_girisleri from public, anon, authenticated;
grant select, insert, update, delete on public.qr_girisleri to service_role;
