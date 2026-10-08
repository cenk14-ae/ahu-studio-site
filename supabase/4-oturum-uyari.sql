-- ============================================================================
-- AHU Studio — 4. adım: TEK OTURUM, UYARILI (08.10.2026)
-- İkinci cihaz girişte UYARILIR ("hesap zaten açık"), kendiliğinden devralmaz.
-- "Yine de aç" derse oturum_baslat çağrılır → eski cihaz Realtime ile ANINDA kapanır.
-- Son sinyali OTURUM_CANLI_SN'den eski oturum "açık" sayılmaz (tarayıcısı kapanmış).
-- ============================================================================

-- Açılışta sorulur: bende mi, başka cihazda canlı bir oturum var mı?
create or replace function public.oturum_durumu()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'bende',      public.oturum_bende(),
    'baska_acik', ( l.aktif_oturum is not null
                    and l.aktif_oturum::text <> coalesce(auth.jwt()->>'session_id', '')
                    and l.oturum_zamani > now() - interval '90 seconds' ),
    'cihaz',      l.oturum_cihaz,
    'zaman',      l.oturum_zamani
  )
  from public.lisanslar l where l.user_id = auth.uid();
$$;

-- Çıkışta: oturum benimse boşalt (öteki cihaz sonra uyarısız girebilsin)
create or replace function public.oturum_bitir()
returns void language sql volatile security definer set search_path = public as $$
  update public.lisanslar set aktif_oturum = null, oturum_zamani = null, oturum_cihaz = null
   where user_id = auth.uid() and aktif_oturum::text = coalesce(auth.jwt()->>'session_id', '');
$$;

revoke execute on function public.oturum_durumu(), public.oturum_bitir() from public, anon;
grant  execute on function public.oturum_durumu(), public.oturum_bitir() to authenticated;

-- Realtime: kullanıcı KENDİ lisans satırındaki değişikliği anında alır (RLS: lisans_oku)
do $$ begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lisanslar') then
    alter publication supabase_realtime add table public.lisanslar;
  end if;
end $$;
