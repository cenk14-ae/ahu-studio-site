-- 9) DEMO KULLANICI (09.10.2026, Cenk: «demo kullanıcı olsun; excel dxf vesaire indiremesin, sadece arayüzü
--    kullanabilsin; tuşlar dursun ama çalışmasın»)
--    · lisanslar.demo: yalnız yönetici değiştirir (lisans_guncelle politikası zaten yönetici ister)
--    · lisans_durumu 'demo' döner; Normal/Pro (surum) BAĞIMSIZDIR
--    · Asıl kapı SUNUCUDADIR: çekirdek dosya üreten istekleri demo lisansa 403 {hata:'demo'} ile reddeder
alter table public.lisanslar add column if not exists demo boolean not null default false;

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
    'demo',         coalesce(l.demo, false) and not public.yonetici_mi()
  )
  from (select 1) d
  left join public.lisanslar l on l.user_id = auth.uid();
$$;
