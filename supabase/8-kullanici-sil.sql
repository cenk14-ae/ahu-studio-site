-- 8) KULLANICI SİLME (09.10.2026) — Cenk: «başvuranları silebilmeliyim, liste gereksiz uzar»
-- Yönetim sayfasındaki «Sil» düğmesi bunu çağırır. Hesabı auth.users'tan siler; lisans satırı
-- (on delete cascade) ve ona bağlı kişisel kütüphane de gider. Kullanıcı yeniden kayıt olabilir.
-- Kapı: yalnız yönetici · yönetici hesabı ve kendi hesabın SİLİNEMEZ.
create or replace function public.kullanici_sil(hedef uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.yonetici_mi() then raise exception 'yalnız yönetici'; end if;
  if hedef = auth.uid() then raise exception 'kendi hesabını silemezsin'; end if;
  if exists (select 1 from public.yoneticiler where user_id = hedef) then raise exception 'yönetici hesabı silinemez'; end if;
  delete from auth.users where id = hedef;
end $$;

revoke all on function public.kullanici_sil(uuid) from public, anon;
grant execute on function public.kullanici_sil(uuid) to authenticated;
