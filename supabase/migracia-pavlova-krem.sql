-- ---------------------------------------------------------------------
-- MIGRÁCIA: krém a coulis na pavlovu
-- ---------------------------------------------------------------------
-- Spusti raz v Supabase -> SQL Editor -> New query.
-- Až po migracia-pavlova-korpus.sql.
--
-- Prenáša kartu "PAVLOVA 20 cm / 10–12 porcií" — to, čo ide na korpus.
-- Oba recepty sú pomenované "Pavlova ...", aby bolo na prvý pohľad
-- vidieť, že patria k pavlove a inde sa nepoužívajú. V abecednom zozname
-- tým stoja hneď vedľa receptu Pavlova korpus.
--
-- PREČO NOVÉ COULIS, KEĎ UŽ JEDNO EXISTUJE
--
-- Recept "Malinové coulis" (ten do choux) je iná vec než coulis z tejto
-- karty. Nie je to tá istá receptúra napísaná inak:
--
--   Malinové coulis        | Pavlova malinové coulis
--   -----------------------+--------------------------------
--   150 g kupovaného pyré  | 200 g mrazených malín
--   15 g cukru (10 g/100 g)| 40 g cukru (20 g/100 g)
--   2,5 g pektínu NH       | bez pektínu
--   pár kvapiek citrónu    | bez citrónu
--   tuhne pektínom         | hustne odparením a mixuje sa
--
-- Prvé musí držať tvar vo vnútri choux, druhé sa vrstvi na korpus.
-- Keby sa použilo jedno pre oboje, buď by bolo coulis na pavlove tuhé
-- ako želé, alebo by z choux vytieklo.
--
-- Bezpečné spustiť aj opakovane — nič už zapísané sa neprepíše.
-- ---------------------------------------------------------------------

-- Mrazené maliny v číselníku neboli — doteraz sa všade rátalo s kupovaným
-- pyré. Cena aj balenie sa doplnia v správe webu; dovtedy sa v kalkulácii
-- vypíšu ako nedoplnené, nie ako nula.
insert into ingredients (name, unit, pack_size, pack_price, note) values
  ('Maliny mrazené', 'g', null, null,
   'Cenu aj balenie doplniť. Z mrazených malín sa varí coulis na pavlovu; po prepasírovaní z nich ostane zhruba polovica až dve tretiny.')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- RECEPTY
--
-- Oba sú napísané na JEDNU tortu Ø 20 cm — presne tak, ako je karta.
-- Pri dvoch tortách si prepočet vypýta dve dávky, pri polovici polovicu.
-- ---------------------------------------------------------------------
insert into recipes (name, yield_qty, yield_unit, yield_label, note, steps) values
  ('Pavlova krém', 1, 'ks', 'tortu Ø 20 cm (10–12 porcií)',
   'ĎALŠIE DOPLNKY, ktoré nie sú medzi surovinami: dužina z 3–4 marakují a čerstvé ovocie na ozdobu. Kupujú sa podľa sezóny a podľa toho, na čom sa so zákazníčkou dohodneš, preto nie sú v kalkulácii — počítaj s nimi pri cene zvlášť.',
   $rec$Mascarpone, šľahačku, práškový cukor a vanilku vyšľahaj naraz do pevného krému a prenes do cukrárskeho vrecka.
Prvý plát korpusu prilep krémom o podložku, nanes naň krém a navrstvi malinové coulis a dužinu z marakuje.
Do stredu nanes malú časť krému a prilep ďalší plát korpusu; na ten opäť krém, coulis a marakuju.
Na posledný plát navrstvi krém a dozdob čerstvým ovocím.$rec$),

  ('Pavlova malinové coulis', 1, 'ks', 'tortu Ø 20 cm',
   'Nie je to isté ako recept Malinové coulis (ten do choux): ten je z kupovaného pyré a tuhne pektínom, tento sa varí z mrazených malín, hustne odparením a má dvojnásobok cukru na 100 g ovocia.',
   $rec$Mrazené maliny povar s cukrom na strednom ohni do jemného zhustnutia.
Malinový rozvar odstav, rozmixuj tyčovým mixérom a prepasíruj cez sito.
Nechaj vychladnúť.$rec$)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- SUROVINY V RECEPTOCH
--
-- Šľahačka je zapísaná vo väčšom balení (250 ml): na 380 ml vyjdú dve
-- balenia, kým z malého (180 ml) by boli tri. Spotreba je v oboch
-- prípadoch rovnaká, líši sa len nákup.
--
-- Vanilka je "štipka" — bez gramáže. Riadok sa v recepte ukáže, do ceny
-- nevstúpi, a je vidieť, že tam je.
-- ---------------------------------------------------------------------
with polozka (recept, surovina, mnozstvo, poradie, pozn) as (values
  ('Pavlova krém',            'Mascarpone',                        380, 1, ''),
  ('Pavlova krém',            'Smotana na šľahanie 33% (väčšia)',  380, 2, 'min. 33 %'),
  ('Pavlova krém',            'Cukor práškový',                    100, 3, ''),
  ('Pavlova krém',            'Vanilka',                          null, 4, 'štipka'),
  ('Pavlova malinové coulis', 'Maliny mrazené',                    200, 1, ''),
  ('Pavlova malinové coulis', 'Cukor kryštálový',                   40, 2, '2 PL = cca 40 g')
)
insert into recipe_items (recipe_id, ingredient_id, amount, optional, note, sort_order)
select r.id, i.id, p.mnozstvo::numeric, false, p.pozn, p.poradie
from polozka p
join recipes r on r.name = p.recept
join ingredients i on i.name = p.surovina
on conflict (recipe_id, ingredient_id) do nothing;

-- ---------------------------------------------------------------------
-- KU KTORÉMU VÝROBKU PATRIA
--
-- Karta je na tortu Ø 20 cm, takže jedna dávka = jedna torta. K Mini
-- Pavlove zámerne priradené nie sú: koľko krému a coulis ide do jednej
-- minipavlovky, karta nehovorí. Keď to budeš vedieť, priradíš ich
-- v správe webu a napíšeš, koľko kusov z dávky vyjde.
-- ---------------------------------------------------------------------
with vazba (recept) as (values
  ('Pavlova krém'), ('Pavlova malinové coulis')
)
insert into product_recipes (product_id, recipe_id, qty_per_piece, pieces_per_batch, note)
select p.id, r.id, 1, 1, 'Karta je napísaná na jednu tortu Ø 20 cm.'
from vazba v
join recipes r on r.name = v.recept
join products p on p.name = 'Pavlova torta' and p.sub = 'Ø 20 cm'
on conflict (product_id, recipe_id) do nothing;

-- ---------------------------------------------------------------------
-- KONTROLA PO SPUSTENÍ
--
-- Pavlova krém má mať 4 suroviny, coulis 2, obe po jednom priradení.
-- Vedľa nich je pre porovnanie aj pôvodné Malinové coulis — má ostať,
-- ako bolo, aj so svojím priradením k choux.
-- ---------------------------------------------------------------------
select r.name as recept, r.yield_qty as vytaznost, r.yield_unit as jednotka,
       count(distinct ri.id) as pocet_surovin,
       count(distinct pr.id) as priradeni
  from recipes r
  left join recipe_items ri on ri.recipe_id = r.id
  left join product_recipes pr on pr.recipe_id = r.id
 where r.name like 'Pavlova%' or r.name = 'Malinové coulis'
 group by r.id, r.name, r.yield_qty, r.yield_unit
 order by r.name;
