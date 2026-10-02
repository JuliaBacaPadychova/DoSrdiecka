-- ---------------------------------------------------------------------
-- MALINOVÝ MOUSSE NA ŠTYRI PRIEMERY
--
-- Z existujúceho receptu na Ø 16 cm vzniknú samostatné recepty na
-- Ø 10, 14 a 18 cm. Gramáže sa násobia PLOCHOU, rovnako ako to robí
-- kalkulačka: koeficient = nový priemer² / 16².
--
--   Ø 10  →  100/256 = 0,390625
--   Ø 14  →  196/256 = 0,765625
--   Ø 18  →  324/256 = 1,265625
--
-- Čísla sa NEOPISUJÚ ručne — kopírujú sa z toho, čo je v recepte práve
-- teraz, aj s jednotkami, poznámkami a poradím surovín. Odpis by sa
-- rozišiel pri najbližšej úprave originálu.
--
-- Existujúci recept sa premenuje na „Malinový mousse Ø 16 cm", aby sa
-- všetky štyri dali rozoznať aj vo vyberacích políčkach, kde je vidieť
-- len názov. Premenuje sa len vtedy, keď sa ešte volá presne
-- „Malinový mousse" — prepísaný vlastný názov sa nechá na pokoji.
--
-- Nové recepty sa k žiadnej príchuti nepriraďujú. Priradenia si nesie
-- pôvodný recept a zdvojiť ich by znamenalo dvakrát započítanú dávku.
--
-- Bezpečné spustiť aj opakovane: recept, ktorý už existuje, sa preskočí
-- a jeho gramáže sa NEPREPÍŠU. Nič sa neodoberá, takže migrácia môže
-- bežať aj pred nasadením — žiadna zmena kódu k nej nepatrí.
-- ---------------------------------------------------------------------

-- 1. Pôvodný recept dostane do názvu priemer, nech sa štyri rovnomenné
--    recepty dajú rozoznať.
update recipes
   set name = 'Malinový mousse Ø 16 cm'
 where name = 'Malinový mousse'
   and diameter_cm = 16;

-- 2. Tri nové recepty — hlavička. Všetko okrem názvu, popisu výťažnosti
--    a priemeru sa preberá z originálu.
insert into recipes (name, group_id, yield_qty, yield_unit, yield_label,
                     diameter_cm, layers, steps, source_url, note, active)
select 'Malinový mousse Ø ' || c.priemer || ' cm',
       z.group_id, z.yield_qty, z.yield_unit,
       'disk Ø ' || c.priemer || ' cm',
       c.priemer, z.layers, z.steps, z.source_url,
       -- Postup hovorí o priemere formy na vklad, ktorý nie je ten istý
       -- ako priemer torty (do 16 cm torty ide 15 cm disk). Prepočítať
       -- ho za ňu by bola hádka, tak sa to radšej napíše.
       trim(both E'\n' from coalesce(z.note, '') || E'\n'
         || 'Prepočítané z receptu na Ø 16 cm plochou (×'
         || replace(to_char(round((c.priemer::numeric * c.priemer) / 256, 6), 'FM0.999999'), '.', ',')
         || '). Pozor na dve veci prebraté z pôvodného receptu: priemer formy '
         || 'na vklad v postupe je ten pre Ø 16 cm, a poznámky pri surovinách '
         || 'hovoria o množstvách pre Ø 16 cm (napr. koľko je to plátkov želatíny).'),
       z.active
  from recipes z
  cross join (values (10), (14), (18)) as c(priemer)
 where z.name = 'Malinový mousse Ø 16 cm'
   and z.diameter_cm = 16
   and not exists (
     select 1 from recipes r2
      where r2.name = 'Malinový mousse Ø ' || c.priemer || ' cm');

-- 3. Suroviny. Gramáže sa násobia plochou, jednotka a poznámka ostávajú
--    také, aké sú v origináli — vrátane toho, že recept môže písať
--    v inej jednotke, než v akej sa surovina kupuje.
insert into recipe_items (recipe_id, ingredient_id, amount, unit, optional,
                          note, sort_order)
select nov.id, p.ingredient_id,
       case when p.amount is null then null
            else round(p.amount * (nov.diameter_cm::numeric * nov.diameter_cm) / 256, 3)
       end,
       p.unit, p.optional, p.note, p.sort_order
  from recipes nov
  join recipes zdroj
    on zdroj.name = 'Malinový mousse Ø 16 cm' and zdroj.diameter_cm = 16
  join recipe_items p on p.recipe_id = zdroj.id
 where nov.name in ('Malinový mousse Ø 10 cm',
                    'Malinový mousse Ø 14 cm',
                    'Malinový mousse Ø 18 cm')
   and not exists (
     select 1 from recipe_items x
      where x.recipe_id = nov.id and x.ingredient_id = p.ingredient_id);
