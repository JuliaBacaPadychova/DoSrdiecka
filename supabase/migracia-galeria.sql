-- ---------------------------------------------------------------------
-- VIAC FOTIEK K JEDNÉMU VÝROBKU
--
-- Brownie torta (a neskôr pavlova) má viac fotiek. Na webe sa prepínajú
-- šípkami priamo v karte; hlavná ostáva tá, ktorá tam je teraz.
--
-- Preto `image_url` ostáva nedotknuté — je to stále tá hlavná fotka,
-- prvá v poradí. Ďalšie sú v `gallery`: zoznam adries v poradí, v akom
-- sa majú prechádzať.
--
-- Prečo zoznam v stĺpci a nie vlastná tabuľka: fotiek je pri výrobku
-- pár, poradie je presne poradie v zozname a `/api/menu` vracia výrobky
-- cez `select=*`, takže sa nemusí nič spájať. Vlastná tabuľka by si
-- vypýtala join, vlastné id a správu poradia navyše — za nič.
--
-- Kontrola drží, že v stĺpci je naozaj zoznam. Bez nej by sa tam dal
-- uložiť objekt alebo číslo a stránka by na tom spadla.
--
-- Bezpečné spustiť aj opakovane. Len pridáva stĺpec, takže môže bežať
-- aj pred nasadením — prázdny zoznam sa správa presne ako doteraz.
-- ---------------------------------------------------------------------

alter table products add column if not exists gallery jsonb not null default '[]'::jsonb;

comment on column products.gallery is
  'Ďalšie fotky k výrobku, v poradí. Hlavná ostáva v image_url a je prvá.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_gallery_chk') then
    alter table products
      add constraint products_gallery_chk check (jsonb_typeof(gallery) = 'array');
  end if;
end $$;
