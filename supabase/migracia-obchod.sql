-- ---------------------------------------------------------------------
-- MIGRÁCIA: obchod pri surovine
-- ---------------------------------------------------------------------
-- Spusti raz v Supabase -> SQL Editor -> New query.
--
-- Pri surovine sa dá zapísať, v akom obchode sa naposledy kupovala.
-- Nová tabuľka ani nový stĺpec netreba — používa sa price_source, ktorý
-- doteraz hovoril, odkiaľ je cena. Je to tá istá vec povedaná inak a dve
-- takmer rovnaké políčka by len mýlili.
--
-- Vymazať treba len pôvodné hodnoty "excel Ciselnik" — to nie je obchod,
-- a v novom stĺpci by vyzerali ako nezmysel.
--
-- Bezpečné spustiť aj opakovane.
-- ---------------------------------------------------------------------

update ingredients
   set price_source = ''
 where price_source = 'excel Ciselnik';

comment on column ingredients.price_source is
  'Obchod, v ktorom sa surovina naposledy kupovala. Spolu s pack_price a price_date hovorí, koľko stála a kedy.';

select name as surovina, pack_price as cena, price_date as nakupene, price_source as obchod
  from ingredients
 where price_source <> ''
 order by name;
