-- ---------------------------------------------------------------------
-- JEDNOTKA SA ZADÁVA PRI RECEPTE, NIE LEN PRI SUROVINE
--
-- Doteraz mala jednotku len surovina a platila všade. Smotana sa kupuje
-- v 500 ml krabici, ale do malinového mousse sa odváži 120 g — a tá istá
-- smotana je v inom recepte odmeraná v mililitroch. Jeden recept nemá
-- prepisovať ostatné, preto si každý riadok receptu nesie vlastnú
-- jednotku (recipe_items.unit). Prázdna = platí jednotka suroviny, čo je
-- bežný prípad, takže sa nič existujúce nemení.
--
-- Cena sa počíta z balenia (ingredients.pack_size), ktoré je v jednotke
-- SUROVINY. Keď recept píše v inej, treba prevod — a ten sa nedá uhádnuť:
-- 120 ml smotany je 120 g, ale 120 ml oleja je 110 g a 120 ml medu 170 g.
-- Preto má surovina dve nepovinné políčka:
--   grams_per_ml  — koľko gramov váži 1 ml (smotana ~1, olej ~0,91)
--   grams_per_ks  — koľko gramov váži 1 kus (plátok želatíny 5 g)
-- Vypĺňajú sa len pri surovine, ktorú naozaj píšeš v dvoch jednotkách.
-- Kým prevod chýba, surovina sa správa ako surovina bez ceny: NEZAPOČÍTA
-- sa a vypíše sa medzi nedopočítanými. Tichý odhad hustoty by spravil
-- cenu, ktorá vyzerá hotovo a nie je.
--
-- Bezpečné spustiť aj opakovane.
-- Doplnenie stĺpcov: môže bežať aj pred nasadením kódu, nič sa neodoberá.
-- ---------------------------------------------------------------------

alter table recipe_items add column if not exists unit text;
alter table ingredients add column if not exists grams_per_ml numeric(10,4);
alter table ingredients add column if not exists grams_per_ks numeric(10,4);

-- Do stĺpca sa smú dostať len jednotky, ktoré pozná aj správa webu.
-- Prázdny reťazec nie je jednotka — to je „ako surovina", čiže null.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'recipe_items_unit_chk'
  ) then
    alter table recipe_items
      add constraint recipe_items_unit_chk
      check (unit is null or unit in ('g', 'ml', 'ks'));
  end if;
end $$;

update recipe_items set unit = null where unit = '';

-- Plátok želatíny Silver 180 bloom váži 5 g. Stálo to v poznámke
-- receptu („3,5 g — cca 2 plátky"), odkiaľ sa počítať nedá; takto sa
-- z toho stane údaj, ktorý vie prepočítať aj cenu. Prepíše sa len vtedy,
-- keď tam ešte nič nie je.
update ingredients
   set grams_per_ks = 5
 where unit = 'ks'
   and grams_per_ks is null
   and name ilike '%želatína%plátková%';
