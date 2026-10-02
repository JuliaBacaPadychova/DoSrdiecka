-- ---------------------------------------------------------------------
-- MALINOVÝ ŽELÉ DISK NA ŠTYRI PRIEMERY
--
-- To isté, čo už má malinový mousse: z disku Ø 16 cm vzniknú disky
-- Ø 10, 14 a 18 cm. Gramáže sa násobia plochou DISKU, lebo disk je
-- fyzický kus, ktorého objem závisí od jeho vlastného priemeru:
--
--   Ø 10  →  100/256 = 0,390625
--   Ø 14  →  196/256 = 0,765625
--   Ø 18  →  324/256 = 1,265625
--
-- `diameter_cm` je pritom priemer TORTY, do ktorej disk ide — teda
-- priemer disku + 2 (10→12, 14→16, 18→20). Disk je vždy o 2 cm menší,
-- aby ho obložil krém. Priemer disku ostáva v názve a v „Kusov čoho".
--
-- Čísla sa neopisujú ručne — kopírujú sa z toho, čo je v recepte práve
-- teraz, aj s jednotkami, poznámkami a poradím surovín.
--
-- V postupe sa prepíše veľkosť ráfika: „Ráfik (16 cm)" je jediný výskyt
-- a znamená práve ten disk, takže sa dá previesť bez hádania. Poznámka
-- pri citrónovej šťave („1 lyžička") sa prepočítať nedá — prevzatá
-- poznámka hovorí o množstve pre Ø 16 cm a je na to upozornené.
--
-- Nové recepty sa k žiadnej príchuti nepriraďujú.
--
-- Bezpečné spustiť aj opakovane: recept, ktorý už existuje, sa preskočí
-- a jeho gramáže sa NEPREPÍŠU. Len pridáva, takže môže bežať aj pred
-- nasadením; žiadna zmena kódu k nej nepatrí.
-- ---------------------------------------------------------------------

insert into recipes (name, group_id, yield_qty, yield_unit, yield_label,
                     diameter_cm, layers, steps, source_url, note, active)
select 'Malinový želé disk Ø ' || c.disk || ' cm',
       z.group_id, z.yield_qty, z.yield_unit,
       'disk Ø ' || c.disk || ' cm',
       c.disk + 2,          -- priemer torty: disk je o 2 cm menší
       z.layers,
       replace(z.steps, 'Ráfik (16 cm)', 'Ráfik (' || c.disk || ' cm)'),
       z.source_url,
       trim(both E'\n' from coalesce(z.note, '') || E'\n'
         || 'Prepočítané z disku Ø 16 cm plochou (×'
         || replace(to_char(round((c.disk::numeric * c.disk) / 256, 6), 'FM0.999999'), '.', ',')
         || '). Poznámky pri surovinách sú prebraté z pôvodného receptu a hovoria '
         || 'o množstvách pre Ø 16 cm (napr. „1 lyžička" citrónovej šťavy).'),
       z.active
  from recipes z
  cross join (values (10), (14), (18)) as c(disk)
 where z.name = 'Malinový želé disk Ø 16 cm'
   and z.yield_label = 'disk Ø 16 cm'
   and not exists (
     select 1 from recipes r2
      where r2.name = 'Malinový želé disk Ø ' || c.disk || ' cm');

insert into recipe_items (recipe_id, ingredient_id, amount, unit, optional,
                          note, sort_order)
select nov.id, p.ingredient_id,
       case when p.amount is null then null
            -- plocha DISKU, nie torty: 14 cm disk je oproti 16 cm disku
            -- (14/16)², nie (16/18)² ako ich torty. Pravidlo „o 2 cm
            -- menší" nie je pomer, tie dve čísla sa nerovnajú.
            else round(p.amount * ((nov.diameter_cm - 2) * (nov.diameter_cm - 2)) / 256, 3)
       end,
       p.unit, p.optional, p.note, p.sort_order
  from recipes nov
  join recipes zdroj
    on zdroj.name = 'Malinový želé disk Ø 16 cm' and zdroj.yield_label = 'disk Ø 16 cm'
  join recipe_items p on p.recipe_id = zdroj.id
 where nov.name in ('Malinový želé disk Ø 10 cm',
                    'Malinový želé disk Ø 14 cm',
                    'Malinový želé disk Ø 18 cm')
   and not exists (
     select 1 from recipe_items x
      where x.recipe_id = nov.id and x.ingredient_id = p.ingredient_id);
