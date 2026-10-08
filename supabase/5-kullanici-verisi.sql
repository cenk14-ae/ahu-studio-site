-- ============================================================================
-- AHU Studio — 5. adım: KULLANICI VERİSİ (08.10.2026)
-- Programların tarayıcıda tuttuğu veri (localStorage + IndexedDB) kullanıcı bazlı ad alanına
-- alındı ve buluta yazılır (index.html → kullanici-verisi.js). Her kullanıcının her programı
-- için TEK nesne: kullanici-verisi/<auth.uid()>/<program_id>.json.gz
-- Kural: YALNIZ SAHİBİ okur/yazar/siler — YÖNETİCİ DE başkasının klasörünü OKUYAMAZ
-- (Cenk istemedi). Ayrıca geçerli lisans + bu cihazın aktif oturum olması (tek oturum)
-- + programın kullanıcıya açık olması şarttır.
-- 1–4'ten SONRA çalışır; birden çok kez çalıştırılabilir.
-- ============================================================================

-- 1) ÖZEL kova (herkese açık DEĞİL); 50 MB sınır
insert into storage.buckets (id, name, public, file_size_limit)
values ('kullanici-verisi', 'kullanici-verisi', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- 2) Kapı: yol <uid>/<program>.json.gz, uid = giriş yapan, lisans geçerli, oturum bu cihazda,
--    program kullanıcıya açık (yönetici her programı açar — ama yine YALNIZ kendi klasöründe)
-- Parametre adı ad OLMAZ: lisanslar.ad sütunuyla çakışır, alt sorguda sütun kazanır (yakalandı: B kendi
-- klasörüne yazamıyordu). Ad değişince create or replace yetmez → önce düşürülür (kurallar aşağıda yeniden kurulur).
drop function if exists public.veri_izni(text) cascade;
create or replace function public.veri_izni(yol text)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and yol ~ '^[0-9a-f-]{36}/[a-z0-9_-]{1,40}\.json\.gz$'
     and split_part(yol, '/', 1) = auth.uid()::text
     and public.oturum_bende()
     and exists (
       select 1 from public.lisanslar l
       where l.user_id = auth.uid()
         and public.lisans_gecerli_mi(l)
         and ( public.yonetici_mi()
            or regexp_replace(split_part(yol, '/', 2), '\.json\.gz$', '') = any(l.programlar) ) );
$$;
revoke execute on function public.veri_izni(text) from public, anon;
grant  execute on function public.veri_izni(text) to authenticated;

-- 3) Depo kuralları (upsert = insert + update + select)
drop policy if exists kullanici_verisi_oku   on storage.objects;
drop policy if exists kullanici_verisi_yaz   on storage.objects;
drop policy if exists kullanici_verisi_degis on storage.objects;
drop policy if exists kullanici_verisi_sil   on storage.objects;
create policy kullanici_verisi_oku on storage.objects for select to authenticated
  using (bucket_id = 'kullanici-verisi' and public.veri_izni(name));
create policy kullanici_verisi_yaz on storage.objects for insert to authenticated
  with check (bucket_id = 'kullanici-verisi' and public.veri_izni(name));
create policy kullanici_verisi_degis on storage.objects for update to authenticated
  using (bucket_id = 'kullanici-verisi' and public.veri_izni(name))
  with check (bucket_id = 'kullanici-verisi' and public.veri_izni(name));
create policy kullanici_verisi_sil on storage.objects for delete to authenticated
  using (bucket_id = 'kullanici-verisi' and public.veri_izni(name));

-- NOT: storage.objects'te başka kovaların kuralları (uygulama_*) bu kovaya izin VERMEZ —
-- hepsi bucket_id = 'uygulama' ile sınırlıdır. Kuralların listesi:
--   select policyname, cmd, qual, with_check from pg_policies where tablename = 'objects';
