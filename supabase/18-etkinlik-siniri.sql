-- 18) ETKİNLİK KAYDI SIKLIK SINIRI (06.11.2026, G-0014 taslak 04; Cenk onayı 06.11.2026)
--     Durum: canlıya uygulandı 06.11.2026 14:35 (uygula.mjs --taslak 1,2,4).
--     Bu dosya taslağın @@UYGULA bölümüdür (birebir); uygula.mjs onu tek istekte (tek örtük işlem) gönderdi.
--     SQL Editor'da da tek seferde çalıştırılır. Geri alma ve doğrulama sorguları iş klasöründe:
--     .ajan/isler/20261106-supabase-uygula/taslak/04-etkinlik-kaydi-siniri.sql (+ .geri.sql).
--
--   G-0014 / taslak 04 — Etkinlik kaydı sıklık sınırı (G-0013 S10). Kaynak: G-0013 duzeltme/04 (içerik aynı;
--   Cenk onayı 06.11: kullanıcı başına saatte 100 ziyaret / 3000 olay). Geri alma: 04-….geri.sql (birebir).

create or replace function public.ziyaret_baslat(program text default null, cihaz text default null)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare yeni uuid;
  SAATLIK_ZIYARET constant integer := 100;
begin
  if auth.uid() is null or not exists (select 1 from public.lisanslar where user_id = auth.uid()) then return null; end if;
  delete from public.ziyaretler where user_id = auth.uid() and baslangic < now() - interval '180 days';
  if (select count(*) from public.ziyaretler
       where user_id = auth.uid() and baslangic > now() - interval '1 hour') >= SAATLIK_ZIYARET then
    return null;
  end if;
  insert into public.ziyaretler (user_id, program, cihaz)
  values (auth.uid(), left(ziyaret_baslat.program, 40), left(ziyaret_baslat.cihaz, 200))
  returning id into yeni;
  return yeni;
end $$;

create or replace function public.ziyaret_nabiz(ziyaret uuid, aktif_sn integer default 0, olaylar jsonb default '[]')
returns void language plpgsql volatile security definer set search_path = public as $$
declare z public.ziyaretler; var_olan integer; saatlik integer; kalan integer;
  SAATLIK_OLAY constant integer := 3000;
begin
  select * into z from public.ziyaretler where id = ziyaret and user_id = auth.uid();
  if not found then return; end if;
  update public.ziyaretler
     set son_sinyal = now(),
         aktif_sn = least(greatest(z.aktif_sn, coalesce(ziyaret_nabiz.aktif_sn, 0)),
                          ceil(extract(epoch from now() - z.baslangic))::integer + 5)
   where id = z.id;
  if jsonb_typeof(olaylar) <> 'array' then return; end if;
  select count(*) into var_olan from public.etkinlikler where ziyaret_id = z.id;
  if var_olan >= 3000 then return; end if;     -- bir ziyarette en çok 3000 olay
  select count(*) into saatlik
    from public.etkinlikler e join public.ziyaretler v on v.id = e.ziyaret_id
   where v.user_id = auth.uid() and v.son_sinyal > now() - interval '1 hour' and e.zaman > now() - interval '1 hour';
  if saatlik >= SAATLIK_OLAY then return; end if;   -- kullanıcı başına saatte en çok 3000 olay
  kalan := least(300, 3000 - var_olan, SAATLIK_OLAY - saatlik);
  begin
    insert into public.etkinlikler (ziyaret_id, zaman, olay, adet)
    select z.id,
           least(greatest(case when e->>'z' ~ '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$' then (e->>'z')::timestamptz else now() end,
                          z.baslangic, now() - interval '10 minutes'), now()),   -- en çok 10 dk geriye: saatlik sayım geri tarihle atlatılamaz
           left(e->>'o', 200),
           case when e->>'n' ~ '^\d{1,5}$' then greatest(1, least((e->>'n')::integer, 10000)) else 1 end
      from (select e from jsonb_array_elements(olaylar) e limit kalan) s
     where coalesce(e->>'o', '') <> '';
  exception when others then null;   -- bozuk bir olay yüzünden nabız düşmesin (süre yine yazılır)
  end;
end $$;

revoke execute on function public.ziyaret_baslat(text, text), public.ziyaret_nabiz(uuid, integer, jsonb) from public, anon;
grant  execute on function public.ziyaret_baslat(text, text), public.ziyaret_nabiz(uuid, integer, jsonb) to authenticated;
