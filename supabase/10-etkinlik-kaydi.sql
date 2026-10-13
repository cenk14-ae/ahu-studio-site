-- ============================================================================
-- 10) ETKİNLİK KAYDI (13.10.2026, Cenk: «site kayıtları sadece son giriş saati şeklinde gözüksün ama
--     profiline tıkladığımda bütün logları tutulsun: saat kaçta girdi, ne kadar aktif kaldı, hangi
--     programı kullandı, programda neler yaptı»)
--   · ziyaretler: her sayfa açılışı (ana sayfa ya da bir program) bir satır — başlangıç, son sinyal,
--     aktif saniye (sekme önde ve son 60 sn'de etkileşim varken sayılır), program, cihaz
--   · etkinlikler: ziyaret içinde basılan düğme/sekme, değiştirilen alan, indirilen dosya (metin; yazı
--     alanlarının İÇERİĞİ yazılmaz)
--   · Kullanıcı yalnız security definer işlevlerle YAZAR, hiç OKUYAMAZ; yalnız yönetici okur/siler.
--   · 180 günden eski kayıt, kullanıcının bir sonraki girişinde silinir.
-- ============================================================================

create table if not exists public.ziyaretler (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  baslangic   timestamptz not null default now(),
  son_sinyal  timestamptz not null default now(),
  aktif_sn    integer not null default 0,
  program     text,                       -- null = ana sayfa
  cihaz       text
);
create index if not exists ziyaretler_kullanici on public.ziyaretler (user_id, baslangic desc);

create table if not exists public.etkinlikler (
  id          bigint generated always as identity primary key,
  ziyaret_id  uuid not null references public.ziyaretler(id) on delete cascade,
  zaman       timestamptz not null,
  olay        text not null,
  adet        integer not null default 1
);
create index if not exists etkinlikler_ziyaret on public.etkinlikler (ziyaret_id, zaman);

alter table public.ziyaretler  enable row level security;
alter table public.etkinlikler enable row level security;
drop policy if exists ziyaret_oku   on public.ziyaretler;
drop policy if exists ziyaret_sil   on public.ziyaretler;
drop policy if exists etkinlik_oku  on public.etkinlikler;
drop policy if exists etkinlik_sil  on public.etkinlikler;
create policy ziyaret_oku  on public.ziyaretler  for select using (public.yonetici_mi());
create policy ziyaret_sil  on public.ziyaretler  for delete using (public.yonetici_mi());
create policy etkinlik_oku on public.etkinlikler for select using (public.yonetici_mi());
create policy etkinlik_sil on public.etkinlikler for delete using (public.yonetici_mi());
revoke all on public.ziyaretler, public.etkinlikler from anon, authenticated;
grant select, delete on public.ziyaretler, public.etkinlikler to authenticated;

-- Sayfa açılınca: yeni ziyaret satırı (lisans satırı olmayana açılmaz)
create or replace function public.ziyaret_baslat(program text default null, cihaz text default null)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare yeni uuid;
begin
  if auth.uid() is null or not exists (select 1 from public.lisanslar where user_id = auth.uid()) then return null; end if;
  delete from public.ziyaretler where user_id = auth.uid() and baslangic < now() - interval '180 days';
  insert into public.ziyaretler (user_id, program, cihaz)
  values (auth.uid(), left(ziyaret_baslat.program, 40), left(ziyaret_baslat.cihaz, 200))
  returning id into yeni;
  return yeni;
end $$;

-- Dakikada bir (ve sayfa kapanırken): son sinyal + aktif süre + biriken olaylar
--   olaylar = [{"z": "2026-10-13T12:00:00Z", "o": "Düğme: Kaydet", "n": 2}, …]
create or replace function public.ziyaret_nabiz(ziyaret uuid, aktif_sn integer default 0, olaylar jsonb default '[]')
returns void language plpgsql volatile security definer set search_path = public as $$
declare z public.ziyaretler; var_olan integer;
begin
  select * into z from public.ziyaretler where id = ziyaret and user_id = auth.uid();
  if not found then return; end if;
  update public.ziyaretler
     set son_sinyal = now(),
         -- aktif süre geri gitmez, geçen süreyi aşamaz
         aktif_sn = least(greatest(z.aktif_sn, coalesce(ziyaret_nabiz.aktif_sn, 0)),
                          ceil(extract(epoch from now() - z.baslangic))::integer + 5)
   where id = z.id;
  if jsonb_typeof(olaylar) <> 'array' then return; end if;
  select count(*) into var_olan from public.etkinlikler where ziyaret_id = z.id;
  if var_olan >= 3000 then return; end if;     -- bir ziyarette en çok 3000 olay
  begin
    insert into public.etkinlikler (ziyaret_id, zaman, olay, adet)
    select z.id,
           least(greatest(case when e->>'z' ~ '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$' then (e->>'z')::timestamptz else now() end, z.baslangic), now()),
           left(e->>'o', 200),
           case when e->>'n' ~ '^\d{1,5}$' then greatest(1, least((e->>'n')::integer, 10000)) else 1 end
      from (select e from jsonb_array_elements(olaylar) e limit least(300, 3000 - var_olan)) s
     where coalesce(e->>'o', '') <> '';
  exception when others then null;   -- bozuk bir olay yüzünden nabız düşmesin (süre yine yazılır)
  end;
end $$;

revoke execute on function public.ziyaret_baslat(text, text), public.ziyaret_nabiz(uuid, integer, jsonb) from public, anon;
grant  execute on function public.ziyaret_baslat(text, text), public.ziyaret_nabiz(uuid, integer, jsonb) to authenticated;
