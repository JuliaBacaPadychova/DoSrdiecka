-- ---------------------------------------------------------------------
-- MIGRÁCIA: malinový a citrónový curd
-- ---------------------------------------------------------------------
-- Spusti raz v Supabase -> SQL Editor -> New query.
-- Až po migracia-receptar.sql a migracia-poradie-surovin.sql.
--
-- Pridáva dva recepty z kariet "CURDY — na báze pyré" a "CURDY — na
-- báze šťavy". Oba sú napísané na cca 300 g hotového curdu, nie na
-- kusy — koľko z nich ide do jedného zákusku, sa povie až pri
-- priradení k príchuti (Gramov do jedného zákusku).
--
-- Recepty zatiaľ nie sú priradené k žiadnej príchuti. Prirad ich
-- v správe webu: Recepty -> Úprava receptov -> Priradiť k príchuti.
--
-- Bezpečné spustiť aj opakovane — nič už zapísané sa neprepíše.
-- ---------------------------------------------------------------------

-- Citrón sa kupuje na kusy a v citrónovom curde sa z neho berie len
-- kôra; šťava je v číselníku vedená zvlášť (kupuje sa aj hotová).
insert into ingredients (name, unit, pack_size, pack_price, note) values
  ('Citrón', 'ks', null, null,
   'Cenu za kus doplniť. V recepte sa z neho berie kôra — šťava je vedená samostatne ako Citrónová šťava.')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- RECEPTY
-- ---------------------------------------------------------------------
insert into recipes (name, yield_qty, yield_unit, yield_label, note, steps) values
  ('Malinový curd', 300, 'g', 'curdu',
   'Na báze pyré. Pyré si robíš sama: z mrazených malín vyjde po prepasírovaní zhruba polovica až dve tretiny, čiže na 150 g pyré treba 225–300 g mrazených malín.',
   $rec$Mrazené maliny krátko povar, rozmixuj a prepasíruj cez sito, aby vzniklo malinové pyré.
V mise zmiešaj všetky suroviny na curd okrem masla.
Misu postav nad vodný kúpeľ a za stáleho miešania povar do zhustnutia (teplota zmesi bude cca 70–75 °C).
Uvarenú omáčku prepasíruj cez sito a vmiešaj do nej studené maslo.
Curd premiestni do uzatvárateľnej nádoby a skladuj v chladničke.$rec$),

  ('Citrónový curd', 300, 'g', 'curdu',
   'Na báze šťavy — pyré sa nerobí, citrónová šťava ide do curdu priamo.',
   $rec$V mise zmiešaj všetky suroviny na curd okrem masla.
Misu postav nad vodný kúpeľ a za stáleho miešania povar do zhustnutia (teplota zmesi bude cca 70–75 °C).
Uvarenú omáčku prepasíruj cez sito a vmiešaj do nej na kocky nakrájané studené maslo.
Curd premiestni do uzatvárateľnej nádoby a skladuj v chladničke.$rec$)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- SUROVINY V RECEPTOCH
--
-- Žĺtok je v číselníku vedený v gramoch (1 žĺtok = 20 g), preto sú
-- z dvoch žĺtkov 40 g a z troch 60 g. Lyžica citrónovej šťavy je 15 ml.
-- Poradie je to, v akom sú suroviny na karte.
-- ---------------------------------------------------------------------
with polozka (recept, surovina, mnozstvo, poradie, pozn) as (values
  ('Malinový curd',  'Pyré malina',        150, 1, 'z 225–300 g mrazených malín — povariť, rozmixovať, prepasírovať'),
  ('Malinový curd',  'Citrónová šťava',     15, 2, '1 PL'),
  ('Malinový curd',  'Cukor kryštálový',    65, 3, ''),
  ('Malinový curd',  'Vajcia žĺtko',        40, 4, '2 žĺtky'),
  ('Malinový curd',  'Maslo 82%',           50, 5, 'studené, vmiešať až do uvarenej omáčky'),
  ('Citrónový curd', 'Citrónová šťava',     90, 1, ''),
  ('Citrónový curd', 'Citrón',               1, 2, 'kôra z 1 citróna'),
  ('Citrónový curd', 'Cukor kryštálový',    80, 3, ''),
  ('Citrónový curd', 'Vajcia žĺtko',        60, 4, '3 žĺtky'),
  ('Citrónový curd', 'Maslo 82%',           80, 5, 'studené, nakrájané na kocky')
)
insert into recipe_items (recipe_id, ingredient_id, amount, optional, note, sort_order)
select r.id, i.id, p.mnozstvo::numeric, false, p.pozn, p.poradie
from polozka p
join recipes r on r.name = p.recept
join ingredients i on i.name = p.surovina
on conflict (recipe_id, ingredient_id) do nothing;

-- ---------------------------------------------------------------------
-- KONTROLA PO SPUSTENÍ
--
-- Oba recepty majú mať 5 surovín. Keby ich mali menej, je v názve
-- suroviny preklep a riadok sa potichu nevložil.
-- ---------------------------------------------------------------------
select r.name as recept, r.yield_qty as vytaznost, r.yield_unit as jednotka,
       count(ri.id) as pocet_surovin
  from recipes r
  left join recipe_items ri on ri.recipe_id = r.id
 where r.name in ('Malinový curd', 'Citrónový curd')
 group by r.id, r.name, r.yield_qty, r.yield_unit
 order by r.name;
