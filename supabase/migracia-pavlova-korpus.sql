-- ---------------------------------------------------------------------
-- MIGRÁCIA: korpus na pavlovu (minipavlovky aj torta)
-- ---------------------------------------------------------------------
-- Spusti raz v Supabase -> SQL Editor -> New query.
-- Až po migracia-receptar.sql a migracia-veterniky.sql.
--
-- Prenáša kartu "PAVLOVA — MINIPAVLOVKY" do receptára.
--
-- Je to JEDEN recept, nie dva. Karta je napísaná na 12 minipavloviek
-- 6–7 cm a z tej istej dávky snehu vznikne aj jeden korpus na Pavlova
-- tortu — je to rovnaký sneh, líši sa len tvar a čas sušenia. Presne na
-- to je v databáze pieces_per_batch: pri Mini Pavlove vyjde z dávky
-- 12 kusov, pri torte 1. Dva recepty s tou istou gramážou by znamenali,
-- že po každej úprave treba opraviť oba — a jeden z nich sa raz zabudne.
--
-- Bezpečné spustiť aj opakovane — nič už zapísané sa neprepíše.
-- ---------------------------------------------------------------------

-- Ocot v číselníku nebol. Kupuje sa "ako kedy kde", takže balenie ani
-- cena zatiaľ nie sú — v kalkulácii sa vypíše ako nedoplnený, nie ako
-- nula. Je ho v recepte 5 ml, takže na cenu za kus to nemá vplyv.
insert into ingredients (name, unit, pack_size, pack_price, note) values
  ('Ocot', 'ml', null, null, 'Cenu aj balenie doplniť. V korpuse na pavlovu je ho 1 ČL na dávku.')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- RECEPT
--
-- Výťažnosť je 12 minipavloviek — to je počet z karty. Koľko kusov
-- vyjde pri torte, povie väzba na príchuť nižšie.
-- ---------------------------------------------------------------------
insert into recipes (name, yield_qty, yield_unit, yield_label, note, steps) values
  ('Pavlova korpus', 12, 'ks', 'minipavloviek 6–7 cm',
   'Tá istá dávka vyjde na 12 minipavloviek alebo na jeden korpus na tortu — pri torte treba overiť po prvom pečení, či dávka stačí na celý priemer. Sušenie 140/100 °C, 100 minút.',
   $rec$Bielky šľahaj na stredných otáčkach do bodu, kedy vytvoria jemnú bielu penu.
Pridávaj cukor po 2–3 PL a po každej dávke nechaj 20–30 sekúnd na zapracovanie, až potom pridaj ďalšiu.
Bielky s cukrom šľahaj ďalej na stredných až stredne vysokých otáčkach 15–25 minút (podľa množstva bielok).
Vyšľahaný bielkový sneh je pevný a lesklý.
Na záver vmiešaj škrob a ocot a krátko prešľahaj.
MINIPAVLOVKY: sneh daj do cukrárskeho vrecka so špičkou Wilton 1M a striekaj ho v troch vrstvách na seba, priemer cca 6–7 cm. Lyžičkou namočenou v studenej vode dotvor priestor na omáčku.
TORTA: z tej istej dávky vytvor jeden korpus — sneh nastriekaj alebo rozotri do kruhu a okraj vytiahni vyššie, nech vznikne priestor na krém a ovocie.
Rúru rozohrej na 140 °C na programe s ventilátorom, plech vlož a teplotu hneď stiahni na 100 °C.
Suš 100 minút. Rúru počas sušenia ani po ňom neotváraj niekoľko hodín, kým plech(y) úplne nevychladnú.
Korpus na tortu je jeden a hrubší, takže sušenie potrvá dlhšie než 100 minút — skutočný čas si po prvom pečení zapíš sem.$rec$)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- SUROVINY V RECEPTE
--
-- Bielok je v číselníku v gramoch, takže 125 g je tých "cca 4 vajcia".
-- Lyžičky sú prepísané na gramy/mililitre podľa toho, čo je na karte
-- v zátvorke: 1,5 ČL škrobu = 10–11 g (zapísaných 10,5), 1 ČL octu = 5 ml.
-- ---------------------------------------------------------------------
with polozka (surovina, mnozstvo, poradie, pozn) as (values
  ('Vajcia bielko',    125,  1, 'cca 4 vajcia'),
  ('Cukor krupicový',  215,  2, ''),
  ('Škrob kukuričný', 10.5,  3, '1,5 ČL (10–11 g)'),
  ('Ocot',               5,  4, '1 ČL')
)
insert into recipe_items (recipe_id, ingredient_id, amount, optional, note, sort_order)
select r.id, i.id, p.mnozstvo::numeric, false, p.pozn, p.poradie
from polozka p
join recipes r on r.name = 'Pavlova korpus'
join ingredients i on i.name = p.surovina
on conflict (recipe_id, ingredient_id) do nothing;

-- ---------------------------------------------------------------------
-- KU KTORÝM VÝROBKOM PATRÍ
--
-- pieces_per_batch = koľko kusov TOHO výrobku vyjde z jednej dávky:
--   Mini Pavlova  -> 12 kusov z dávky (to je výťažnosť z karty)
--   Pavlova torta -> 1 kus z dávky (celá dávka je jeden korpus)
--
-- "Chcem inú kombináciu chutí" zámerne priradené nie je — tam sa
-- zloženie dohaduje z poznámky k objednávke, rovnako ako pri Choux.
-- ---------------------------------------------------------------------
with vazba (vyrobok, velkost, z_davky, pozn) as (values
  ('Mini Pavlova',  'Jemná klasika', 12, ''),
  ('Pavlova torta', 'Ø 20 cm',        1, 'Celá dávka je jeden korpus. Ak by na Ø 20 cm nestačila, zmeň toto číslo (0,667 = dávka a pol na tortu).')
)
insert into product_recipes (product_id, recipe_id, qty_per_piece, pieces_per_batch, note)
select p.id, r.id, 1, v.z_davky::numeric, v.pozn
from vazba v
join products p on p.name = v.vyrobok and p.sub = v.velkost
join recipes r on r.name = 'Pavlova korpus'
on conflict (product_id, recipe_id) do nothing;

-- ---------------------------------------------------------------------
-- KONTROLA PO SPUSTENÍ
--
-- Recept má mať 4 suroviny a 2 priradenia. Keby ich bolo menej, je
-- v názve suroviny alebo výrobku preklep a riadok sa potichu nevložil.
-- ---------------------------------------------------------------------
select r.name as recept, r.yield_qty as vytaznost, r.yield_label as coho,
       count(distinct ri.id) as pocet_surovin,
       count(distinct pr.id) as priradeni,
       string_agg(distinct p.name || ' — ' || p.sub || ' (z dávky '
                  || trim(trailing '.' from trim(trailing '0' from pr.pieces_per_batch::text))
                  || ')', ', ') as kde
  from recipes r
  left join recipe_items ri on ri.recipe_id = r.id
  left join product_recipes pr on pr.recipe_id = r.id
  left join products p on p.id = pr.product_id
 where r.name = 'Pavlova korpus'
 group by r.id, r.name, r.yield_qty, r.yield_label;
