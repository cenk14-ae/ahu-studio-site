-- 17) KAYIT ALANLARI + E-POSTA DOĞRULAMA DAMGASI + DOĞRULAMA KODU (06.11.2026, G-0014 taslak 03; Cenk onayı 06.11.2026)
--     Durum: canlıya uygulandı 06.11.2026 14:36 (uygula.mjs --taslak 03).
--     Bu dosya taslağın @@UYGULA bölümüdür (birebir); uygula.mjs onu tek istekte (tek örtük işlem) gönderdi.
--     SQL Editor'da da tek seferde çalıştırılır. Geri alma ve doğrulama sorguları iş klasöründe:
--     .ajan/isler/20261106-supabase-uygula/taslak/03-kayit-dogrulama-ve-eposta-kodu.sql (+ .geri.sql).
--
--   G-0014 / taslak 03 — Kayıt alanları + e-posta doğrulama damgası + doğrulama kodu (G-0013 YENİ-3, S13, S16)
--   Sürüm 2 (06.11.2026, G-0015'ten SONRA). Geri alma: 03-kayit-dogrulama-ve-eposta-kodu.geri.sql (birebir).
--   
--   G-0015'in canlıda yaptıkları (.ajan/isler/20261106-kayit-onay/): Auth «Confirm email» AÇIK (mailer_autoconfirm=false,
--   Türkçe doğrulama e-postası); yeni_kullanici() hesabı KAPALI doğurur (aktif=false, demo, bitis NULL, «Onay bekliyor»);
--   lisans_onay_demo tetikleyicisi Cenk «Aktif»i işaretleyince bitişi bugün+7 yapar. Bu taslak bunlara DOKUNMAZ.
--   
--   Bu yüzden G-0013 taslak 03'ün birinci sürümünden çıkarılanlar:
--    · «doğrulanınca demoyu kendiliğinden aç» mantığı — Cenk'in kararı artık ELLE ONAY (G-0015).
--    · yeni_kayit_bildir değişikliği — kayıt bildirimi bugünkü gibi kayıtta gider (Cenk onay vereceği hesabı görsün).
--    · Auth adımı — G-0015'te yapıldı.
--   Kalanlar:
--    1) yeni_kullanici(): G-0015 tanımı AYNEN, yalnız ad/firma kırpma eklendi (S13: btrim, 120 / 160 karakter).
--    2) YENİ kullanici_dogrulandi() + auth.users tetikleyicisi: e-posta GERÇEKTEN doğrulandığında (doğrulama e-postası
--       gönderilmiş: confirmation_sent_at dolu) lisanslar.eposta_dogrulandi dolar. Sonuç:
--         · Yönetim sayfası hesabın e-postasını doğrulayıp doğrulamadığını gösterebilir (G-0015 «Kalan» maddesi);
--         · lisans başvurusunda 6 haneli kod istenmez (basvuru_durumum.dogrulandi = true);
--         · auto-confirm ileride yeniden açılsa bile damga sahtelenmez (e-posta gitmeden doğrulama sayılmaz).
--       Lisansın aktifliğine/bitişine DOKUNMAZ. Hata olursa uyarı yazar, doğrulamayı ENGELLEMEZ.
--    3) eposta_kodu_gonder(): G-0013 sıkılaştırması (e-postada `ad` yok, günde en çok 10 kod — Cenk onayı). Kod akışı
--       yalnız 23.10–06.11 arasında doğrulamasız açılmış eski hesaplar için kalır (yeni hesaplar 2 ile doğrulanmış gelir).
--    YENİ-3'ün kökü (başkasının adresiyle kayıt olup oturum açmak) G-0015'in Confirm email'i ile KAPANDI; 3 savunma derinliği.

create or replace function public.eposta_kodu_gonder()
returns text language plpgsql security definer set search_path = public as $$
declare l public.lisanslar; g timestamptz[]; k text;
begin
  if auth.uid() is null then raise exception 'oturum gerekli'; end if;
  select * into l from public.lisanslar where user_id = auth.uid();
  if l.eposta_dogrulandi is not null then return 'zaten'; end if;
  -- son 24 saatin gönderimleri saklanır (eskiden yalnız son 1 saat)
  select array(select x from unnest(coalesce(e.gonderim, '{}')) x where x > now() - interval '24 hours')
    into g from public.eposta_kodlari e where e.user_id = auth.uid();
  g := coalesce(g, '{}');
  if exists (select 1 from unnest(g) x where x > now() - interval '60 seconds') then
    raise exception 'Kod az önce gönderildi; bir dakika bekleyip tekrar iste.';
  end if;
  if (select count(*) from unnest(g) x where x > now() - interval '1 hour') >= 5 then
    raise exception 'Çok fazla kod istendi; bir saat sonra tekrar dene.';
  end if;
  if coalesce(array_length(g, 1), 0) >= 10 then
    raise exception 'Bugün çok fazla kod istendi; yarın tekrar dene.';
  end if;
  k := lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
  insert into public.eposta_kodlari (user_id, kod_ozet, son, deneme, gonderim)
  values (auth.uid(), public.eposta_kod_ozeti(k, auth.uid()), now() + interval '15 minutes', 0, g || now())
  on conflict (user_id) do update set kod_ozet = excluded.kod_ozet, son = excluded.son, deneme = 0, gonderim = excluded.gonderim;
  -- G-0013 YENİ-3: kullanıcının yazdığı ad doğrulanmamış adrese giden e-postaya KONMAZ
  perform public.bildirim_gonder('kod', jsonb_build_object('eposta', l.eposta, 'kod', k));
  return 'gonderildi';
end $$;
revoke all on function public.eposta_kodu_gonder() from public, anon;
grant execute on function public.eposta_kodu_gonder() to authenticated;

-- G-0015 tanımı + S13 kırpma (başka hiçbir şey değişmedi)
create or replace function public.yeni_kullanici()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.lisanslar (user_id, eposta, ad, firma, aktif, demo, surum, bitis, notlar)
  values (new.id, new.email,
          left(nullif(btrim(new.raw_user_meta_data->>'ad'), ''), 120),
          left(nullif(btrim(new.raw_user_meta_data->>'firma'), ''), 160),
          false, true, 'tam', null,
          'Onay bekliyor (kayıt ' || to_char(current_date, 'DD.MM.YYYY') || '). Aktif işaretlenince 7 günlük demo o gün başlar.')
  on conflict (user_id) do nothing;
  return new;
end $$;
revoke execute on function public.yeni_kullanici() from public, anon, authenticated;

-- E-posta gerçekten doğrulandı → lisanslar.eposta_dogrulandi (lisans durumuna dokunmaz)
create or replace function public.kullanici_dogrulandi()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.confirmation_sent_at is not null then        -- doğrulama e-postası gitti ve bağlantı tıklandı
      update public.lisanslar set eposta_dogrulandi = coalesce(eposta_dogrulandi, new.email_confirmed_at)
       where user_id = new.id;
    end if;
  exception when others then
    raise warning 'kullanici_dogrulandi (%): %', new.id, sqlerrm;   -- doğrulamayı ENGELLEME
  end;
  return new;
end $$;
revoke execute on function public.kullanici_dogrulandi() from public, anon, authenticated;

drop trigger if exists kullanici_dogrulandi on auth.users;
create trigger kullanici_dogrulandi
  after update of email_confirmed_at on auth.users
  for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.kullanici_dogrulandi();
