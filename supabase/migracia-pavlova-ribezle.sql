-- ---------------------------------------------------------------------
-- MIGRÁCIA: doplnky medzi suroviny + ríbezľový krém na minipavlovky
-- ---------------------------------------------------------------------
-- Spusti raz v Supabase -> SQL Editor -> New query.
-- Až po migracia-pavlova-krem.sql.
--
-- Robí dve veci:
--
-- 1) DOPLNKY UŽ NIE SÚ LEN V POZNÁMKE. Marakuja a ovocie na ozdobu
--    pribudnú ako suroviny a zapíšu sa do receptu Pavlova krém. Ovocie
--    ostáva bez gramáže (mení sa podľa sezóny) — v recepte ho vidno,
--    do ceny nevstúpi a v kalkulácii sa vypíše ako "bez gramáže",
--    takže ticho nezmizne.
--
-- 2) NOVÝ RECEPT z karty "PAVLOVA — MINIPAVLOVKY / krém z čiernych
--    ríbezlí", napísaný na 12 minipavloviek.
--
-- Bezpečné spustiť aj opakovane — nič už zapísané sa neprepíše.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- NOVÉ SUROVINY
--
-- Marakuja sa kupuje na kusy, preto pack_size = 1: cena je cena za jeden
-- plod. Čierne ríbezle sú vedené MRAZENÉ, nie ako pyré — karta hovorí
-- "80 g pyré z dvojnásobku, čiže zo 160 g mrazeného ovocia", a to, čo sa
-- naozaj kupuje, je tých 160 g.
-- ---------------------------------------------------------------------
insert into ingredients (name, unit, pack_size, pack_price, note) values
  ('Marakuja', 'ks', 1, null,
   'Cena za jeden plod. Do torty idú dužiny z 3–4 marakují.'),
  ('Ovocie na ozdobu', 'g', null, null,
   'Čerstvé ovocie na dozdobenie. Zámerne bez gramáže aj ceny — mení sa podľa sezóny a dohody so zákazníčkou. V recepte je vidieť, do ceny nevstupuje.'),
  ('Čierne ríbezle mrazené', 'g', null, null,
   'Cenu aj balenie doplniť. Pyré sa z nich varí a pasíruje: zo 160 g mrazených ríbezlí vyjde cca 80 g pyré.')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- 1) DOPLNKY DO RECEPTU NA TORTU
--
-- Zapísané sú 4 marakuje, hoci karta hovorí 3–4: v nákupnom zozname je
-- lepšie mať o plod viac než o jeden menej.
-- ---------------------------------------------------------------------
with polozka (surovina, mnozstvo, poradie, pozn) as (values
  ('Marakuja',          4, 5, 'dužina z 3–4 marakují — zapísané 4, nech v zozname skôr prebýva'),
  ('Ovocie na ozdobu', null, 6, 'podľa sezóny — na dozdobenie vrchu')
)
insert into recipe_items (recipe_id, ingredient_id, amount, optional, note, sort_order)
select r.id, i.id, p.mnozstvo::numeric, false, p.pozn, p.poradie
from polozka p
join recipes r on r.name = 'Pavlova krém'
join ingredients i on i.name = p.surovina
on conflict (recipe_id, ingredient_id) do nothing;

-- Poznámka hovorila, že doplnky medzi surovinami NIE SÚ. Už sú, tak sa
-- prepíše — ale len vtedy, ak je tam stále tá pôvodná veta. Keby si ju
-- medzitým prepísala vlastnou, ostane tvoja.
update recipes
   set note = 'Marakuja aj ovocie na ozdobu sú medzi surovinami. Ovocie je zámerne bez gramáže — mení sa podľa sezóny, takže do ceny nevstupuje a treba s ním počítať zvlášť.'
 where name = 'Pavlova krém'
   and note like 'ĎALŠIE DOPLNKY%';

-- ---------------------------------------------------------------------
-- 2) KRÉM Z ČIERNYCH RÍBEZLÍ NA MINIPAVLOVKY
--
-- Ganáž a krém sú na karte dve časti, ale v databáze je to JEDEN recept:
-- celá ganáž ide do tohto krému a nikde inde sa nepoužíva. Samostatný
-- recept by znamenal dve miesta na opravu a riziko, že sa ríbezle
-- započítajú dvakrát — presne to sa v exceli stalo karamelu.
-- (Karamel je samostatný recept preto, že sa DELÍ medzi dva recepty.)
--
-- Obe fázy sú v postupe oddelené, vrátane troch hodín v chladničke.
-- ---------------------------------------------------------------------
insert into recipes (name, yield_qty, yield_unit, yield_label, note, steps) values
  ('Pavlova krém z čiernych ríbezlí', 12, 'ks', 'minipavloviek 6–7 cm',
   'Ganáž treba pripraviť dopredu — chladí sa minimálne 3 hodiny. Karta k tomuto krému počíta ešte 100–130 g citrónového curdu na dávku (1–2 ČL do jednej minipavlovky); curd je vlastný recept, preto tu medzi surovinami nie je.',
   $rec$GANÁŽ: mrazené čierne ríbezle krátko povar, rozmixuj tyčovým mixérom a prepasíruj cez sito. Zo 160 g mrazených ríbezlí vyjde cca 80 g pyré.
Odváž si 80 g pyré, zmiešaj ho s bielou čokoládou a roztop nad vodným kúpeľom.
Ganáž odlož do chladničky minimálne na 3 hodiny.
KRÉM: mascarpone so šľahačkou, cukrom a ríbezľovou ganážou vyšľahaj naraz do pevného krému a prenes do cukrárskeho vrecka so špičkou Wilton 1M.
Korpusy na minipavlovky môžeš prilepiť trochou krému na podložky pod minidezerty, alebo ich vynechať.
Minipavlovky naplň 1–2 ČL citrónového curdu a navrstvi na ne krém z čiernych ríbezlí.
Dozdob čerstvým ovocím.$rec$)
on conflict (name) do nothing;

with polozka (surovina, mnozstvo, poradie, pozn) as (values
  ('Čierne ríbezle mrazené',           160,  1, 'na cca 80 g pyré — povariť, rozmixovať, prepasírovať'),
  ('Čokoláda biela 28%',               100,  2, 'do ganáže'),
  ('Mascarpone',                       120,  3, ''),
  ('Smotana na šľahanie 33% (väčšia)', 200,  4, 'min. 33 %'),
  ('Cukor práškový',                    40,  5, ''),
  ('Ovocie na ozdobu',                null,  6, 'podľa sezóny')
)
insert into recipe_items (recipe_id, ingredient_id, amount, optional, note, sort_order)
select r.id, i.id, p.mnozstvo::numeric, false, p.pozn, p.poradie
from polozka p
join recipes r on r.name = 'Pavlova krém z čiernych ríbezlí'
join ingredients i on i.name = p.surovina
on conflict (recipe_id, ingredient_id) do nothing;

-- K PRÍCHUTI SA TENTO RECEPT ZÁMERNE NEPRIRAĎUJE.
--
-- Mini Pavlova má na webe jedinú konkrétnu príchuť "Jemná klasika" a tá
-- je popísaná ako vanilkový krém, lemon curd a čerstvé maliny — teda iný
-- krém, než je na tejto karte. Priradiť ríbezľový krém k nej by znamenalo
-- ticho zmeniť to, čo si zákazníčka objednáva. Rozhodnutie, či ide
-- o novú príchuť alebo o novú podobu Jemnej klasiky, patrí majiteľke;
-- priradí ho v správe webu: Recepty -> Úprava receptov -> Priradiť
-- k príchuti, "kusov z dávky" = 12.

-- ---------------------------------------------------------------------
-- KONTROLA PO SPUSTENÍ
--
-- Pavlova krém má mať 6 surovín (4 pôvodné + marakuja a ovocie),
-- Pavlova krém z čiernych ríbezlí 6 a zatiaľ 0 priradení.
-- ---------------------------------------------------------------------
select r.name as recept, r.yield_qty as vytaznost, r.yield_label as coho,
       count(distinct ri.id) as pocet_surovin,
       count(distinct pr.id) as priradeni
  from recipes r
  left join recipe_items ri on ri.recipe_id = r.id
  left join product_recipes pr on pr.recipe_id = r.id
 where r.name like 'Pavlova%'
 group by r.id, r.name, r.yield_qty, r.yield_label
 order by r.name;
