-- ============================================================================
-- AHU Studio — 20: ADMINCENK İZNİ (11.11.2026)
-- Cenk: «admincenk kodunun kimlerde çalışıp çalışmayacağını da yönetim panelinde
-- kontrol edebilmeliyim». Karar (Cenk): başlangıçta YALNIZ yöneticide açık; öteki
-- herkes kapalı başlar, yönetim panelinden kullanıcı kullanıcı açılır.
--
--  · lisanslar.admin_kod — yalnız yönetici yazabilir (mevcut lisans_guncelle politikası).
--  · lisans_durumu() + 'admin_kod' = yönetici VEYA lisans izni. Site bunu AHU Studio'ya
--    el sıkışmayla iletir; sunucu (cekirdek/index.ts) imalat işlerini (gercek, gsmFanlar)
--    bu alana bağlar — asıl kapı oradadır.
-- Birden çok kez çalıştırılabilir. 19-lisans-notlari.sql'den SONRA.
-- ============================================================================

alter table public.lisanslar add column if not exists admin_kod boolean not null default false;

create or replace function public.lisans_durumu()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'var',          l.user_id is not null,
    'aktif',        coalesce(l.aktif, false),
    'surum',        l.surum,
    'bitis',        l.bitis,
    'gecerli',      coalesce(public.lisans_gecerli_mi(l), false),
    'yonetici',     public.yonetici_mi(),
    'programlar',   coalesce(l.programlar, '{}'),
    'ad',           l.ad,
    'oturum_bende', public.oturum_bende(),
    'demo',         coalesce(l.demo, false) and not public.yonetici_mi(),
    'admin_kod',    public.yonetici_mi() or coalesce(l.admin_kod, false)
  )
  from (select 1) d
  left join public.lisanslar l on l.user_id = auth.uid();
$$;
