-- ---------------------------------------------------------------------
-- MIGRÁCIA: veterníky
-- ---------------------------------------------------------------------
-- Spusti raz v Supabase -> SQL Editor -> New query.
--
-- Prenáša "Veterník_varianty.xlsx" do receptára. Nové suroviny netreba —
-- číselník v tom exceli je zhodný s tým, ktorý je v databáze.
--
-- Gramáže sa preberajú z hárkov "Kalkulacka - ...", nie zo stĺpca
-- "v gramoch": kalkulačky sa zhodujú s textom receptu takmer všade,
-- stĺpec sa líši pri piatich položkách. Kde sa líšia všetky tri zdroje,
-- je to napísané v poznámke receptu.
--
-- Bezpečné spustiť aj opakovane.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- Z jednej dávky cesta vyjde 20 choux, ale len 12 veterníkov.
--
-- Doteraz sa počítalo, že dávka vydá vždy toľko kusov, na koľko je
-- recept napísaný. Pri veterníku to neplatí — sú väčšie. Preto sa dá
-- pri konkrétnej príchuti povedať, koľko kusov z dávky naozaj vyjde.
-- Prázdne = platí výťažnosť receptu.
-- ---------------------------------------------------------------------
alter table product_recipes
  add column if not exists pieces_per_batch numeric(10,3);

comment on column product_recipes.pieces_per_batch is
  'Koľko kusov tejto príchute vyjde z jednej dávky receptu. Prázdne = výťažnosť receptu. Používa sa len pri receptoch písaných na kusy.';

-- ---------------------------------------------------------------------
-- RECEPTY
-- ---------------------------------------------------------------------
insert into recipes (name, kind, yield_qty, yield_unit, note, steps) values
  ('Slaný a sladký karamel', 'ine', 10, 'ks',
   'Z jednej dávky vyjde karamel na polevu (240 g slaného) aj na šľahačku (250 g sladkého). Preto sa v ich receptoch karamel neuvádza znovu — inak by sa rátal dvakrát, ako to bolo v exceli.',
   $rec$Cukor rozpusti suchou metódou, bez miešania a na strednom plameni.
Miešať začni až vtedy, keď sa začne prepaľovať prvý karamel.
Do rozpusteného cukru pridaj maslo, zapracuj a prilej zohriatu smotanu na šľahanie.
Karamel povar ešte 2–3 minúty a rozdeľ na dve polovice — do jednej vsyp ½ ČL soli.
Nechaj vychladnúť pri izbovej teplote.
Pozor: priprav karamel vo väčšom hrnci, nie v malej rajnici.$rec$),

  ('Karamelová poleva', 'poleva', 10, 'ks',
   'Karamel je vedený samostatným receptom, preto tu nie je. Pomer karamel : čokoláda je 4:1, čiže na 65 g čokolády ide 240 g slaného karamelu.',
   $rec$Polevu priprav roztopením slaného karamelu s bielou čokoládou nad vodným kúpeľom.
Na 10 veterníkov treba približne 240 g pripraveného slaného karamelu, roztápaného s bielou čokoládou v pomere 4:1.
Klobúčiky namoč do pripravenej polevy, prebytočnú polevu nechaj stiecť.
Môžeš dozdobiť karamelizovanými orieškami.$rec$),

  ('Vanilkový krém Suzys', 'krem', 10, 'ks',
   'POZOR: mascarpone má v exceli tri rôzne hodnoty — text 480 g, stĺpec 380 g, kalkulačka 280 g. Zapísaných je 280 g podľa kalkulačky, treba overiť.',
   $rec$Bielu čokoládu rozpusti nad vodným kúpeľom alebo v mikrovlnke; pri mikrovlnke premiešaj každých 10–20 sekúnd.
Bielu čokoládu daj novú, nie temperovanú — tá sa rozpúšťa ťažšie.
Vyšľahaj krém z mascarpone, šľahačky, cukru a vanilky.
Z krému odober 2–3 PL do roztopenej čokolády, dobre premiešaj a vráť k zvyšnému krému.
Krém krátko prešľahaj a prenes do cukrárskeho vrecka so špičkou Wilton 1M.
Krém rozdeľ do dvoch sáčkov — ak narveš jeden na plno, tlakom ho zrazíš.$rec$),

  ('Karamelová šľahačka', 'krem', 10, 'ks',
   'Gramáže sú na 12 kusov zámerne, aby komfortne vyšli na 10 — pri pôvodnej dávke šľahačka nevyšla na všetky. Karamel je vedený samostatným receptom (odoberá sa z neho 250 g sladkého).',
   $rec$Z pripraveného sladkého karamelu odober 250 g.
Vyšľahaj so šľahačkou a mascarpone na pevný šľahačkový krém.
Šľahačku prenes do cukrárskeho vrecka so špičkou Wilton 1M.
Ak sa ti krém pri miešaní zdá už stuhnutý, prestaň miešať. Keď máš pocit, že ešte trošku, tak prestaň.$rec$),

  ('Pistáciová poleva', 'poleva', 10, 'ks', '',
   $rec$Bielu čokoládu rozpusti s pistáciovou pastou a kakaovým maslom nad vodným kúpeľom alebo v mikrovlnke.
Klobúčiky namáčaj do polevy ihneď, nechaj jemne odkvapkať a odlož na podložku.$rec$),

  ('Pistáciový krém — veterník', 'krem', 10, 'ks',
   'Iný pomer než pistáciový krém do choux — ten je na menšie kusy. Preto sú to dva samostatné recepty.',
   $rec$Najskôr rozpusti bielu čokoládu s pistáciovou pastou a nechaj jemne vychladnúť.
Mascarpone, šľahačku 33 % a cukor vymiešaj do pevnej hmoty, tú po malých kúskoch prenes do čokolády.
Keď bude čokoláda vychladená krémom, pridaj ju do vyšľahanej hmoty a zapracuj už len stierkou — nemixuj.$rec$),

  ('Malinová šľahačka', 'krem', 10, 'ks', '',
   $rec$Aspoň 2 hodiny vopred priprav malinovú ganáž zmiešaním horúceho malinového pyré a bielej čokolády; odlož do chladničky.
Šľahačku 40 %, mascarpone a malinovú ganáž vyšľahaj do pevnej hmoty.
Cez špičku Wilton 1M navrstvi pistáciový krém, malinovú šľahačku a priklop klobúčik s pistáciovou polevou.$rec$),

  ('Čokoládová poleva', 'poleva', 10, 'ks', '',
   $rec$Tmavú čokoládu rozpusti s kakaovým maslom nad vodným kúpeľom alebo v mikrovlnke.
Klobúčiky namáčaj do polevy ihneď, nechaj jemne odkvapkať a odlož na podložku.$rec$),

  ('Čokoládový krém', 'krem', 10, 'ks', '',
   $rec$Najskôr rozpusti tmavú čokoládu a nechaj jemne vychladnúť.
Mascarpone, šľahačku 33 % a cukor vymiešaj do pevnej hmoty, tú po malých kúskoch prenes do čokolády.
Keď bude čokoláda vychladená krémom, pridaj ju do vyšľahanej hmoty a zapracuj už len stierkou — nemixuj.$rec$),

  ('Vanilková šľahačka', 'krem', 10, 'ks', '',
   $rec$Šľahačku 40 %, mascarpone, cukor a vanilku vyšľahaj naraz do pevnej hmoty.
Cez špičku Wilton 1M navrstvi čokoládový krém, vanilkovú šľahačku a priklop klobúčik s čokoládovou polevou.
Hotové veterníky odlož do chladničky na 1–2 hodiny.$rec$)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- POLOŽKY RECEPTOV
-- ---------------------------------------------------------------------
with polozka (recept, surovina, mnozstvo, volitelna, pozn) as (values
  ('Slaný a sladký karamel', 'Cukor kryštálový',                375,  false, 'v kalkulačke bol vedený ako krupicový — cena je rovnaká'),
  ('Slaný a sladký karamel', 'Smotana na šľahanie 33% (malá)',  225,  false, 'zohriata'),
  ('Slaný a sladký karamel', 'Maslo 82%',                       170,  false, ''),
  ('Slaný a sladký karamel', 'Soľ',                             0.75, false, '½ ČL do slanej polovice'),

  ('Karamelová poleva',      'Čokoláda biela 28%',              65,   false, 'karamel v pomere 4:1 je zo samostatného receptu'),

  ('Vanilkový krém Suzys',   'Mascarpone',                      280,  false, 'overiť — v exceli 480 / 380 / 280'),
  ('Vanilkový krém Suzys',   'Smotana na šľahanie 33% (malá)',  250,  false, ''),
  ('Vanilkový krém Suzys',   'Čokoláda biela 28%',              65,   false, ''),
  ('Vanilkový krém Suzys',   'Cukor práškový',                  50,   false, ''),
  ('Vanilkový krém Suzys',   'Vanilka',                         null, false, '½ ČL mletej'),

  ('Karamelová šľahačka',    'Mascarpone',                      150,  false, ''),
  ('Karamelová šľahačka',    'Smotana na šľahanie 40%',         300,  false, ''),

  ('Pistáciová poleva',      'Čokoláda biela 28%',              140,  false, ''),
  ('Pistáciová poleva',      'Pasta pistáciová 100%',           30,   false, ''),
  ('Pistáciová poleva',      'Maslo kakaové',                   17,   false, ''),

  ('Pistáciový krém — veterník', 'Mascarpone',                  400,  false, ''),
  ('Pistáciový krém — veterník', 'Smotana na šľahanie 33% (malá)', 100, false, ''),
  ('Pistáciový krém — veterník', 'Cukor práškový',              40,   false, ''),
  ('Pistáciový krém — veterník', 'Čokoláda biela 28%',          100,  false, ''),
  ('Pistáciový krém — veterník', 'Pasta pistáciová 100%',       70,   false, ''),
  ('Pistáciový krém — veterník', 'Soľ',                         null, false, 'štipka — nevynechať'),
  ('Pistáciový krém — veterník', 'Vanilka',                     null, true,  'voliteľne ½ ČL'),

  ('Malinová šľahačka',      'Mascarpone',                      30,   false, ''),
  ('Malinová šľahačka',      'Smotana na šľahanie 40%',         150,  false, ''),
  ('Malinová šľahačka',      'Pyré malina',                     100,  false, 'z cca 150 g mrazeného ovocia'),
  ('Malinová šľahačka',      'Čokoláda biela 28%',              100,  false, 'na malinovú ganáž'),

  ('Čokoládová poleva',      'Čokoláda tmavá 54%',              170,  false, ''),
  ('Čokoládová poleva',      'Maslo kakaové',                   17,   false, ''),

  ('Čokoládový krém',        'Mascarpone',                      260,  false, ''),
  ('Čokoládový krém',        'Smotana na šľahanie 33% (malá)',  260,  false, ''),
  ('Čokoládový krém',        'Cukor práškový',                  60,   false, ''),
  ('Čokoládový krém',        'Čokoláda tmavá 54%',              120,  false, ''),

  ('Vanilková šľahačka',     'Mascarpone',                      80,   false, ''),
  ('Vanilková šľahačka',     'Smotana na šľahanie 40%',         220,  false, ''),
  ('Vanilková šľahačka',     'Cukor práškový',                  40,   false, ''),
  ('Vanilková šľahačka',     'Vanilka',                         null, false, '⅓ ČL')
)
insert into recipe_items (recipe_id, ingredient_id, amount, optional, note)
select r.id, i.id, p.mnozstvo::numeric, p.volitelna, p.pozn
from polozka p
join recipes r on r.name = p.recept
join ingredients i on i.name = p.surovina
on conflict (recipe_id, ingredient_id) do nothing;

-- ---------------------------------------------------------------------
-- ZLOŽENIE PRÍCHUTÍ
--
-- Z jednej dávky odpalovaného cesta vyjde 12 veterníkov (pri choux 20),
-- preto pieces_per_batch = 12. Ostatné recepty sú písané priamo na
-- 10 veterníkov, tam sa nič neprepisuje.
-- ---------------------------------------------------------------------
with vazba (prichut, recept, kusov_z_davky) as (values
  ('Karamelový',           'Odpalované cesto',          12),
  ('Karamelový',           'Slaný a sladký karamel',    null),
  ('Karamelový',           'Karamelová poleva',         null),
  ('Karamelový',           'Vanilkový krém Suzys',      null),
  ('Karamelový',           'Karamelová šľahačka',       null),
  ('Pistáciovo-malinový',  'Odpalované cesto',          12),
  ('Pistáciovo-malinový',  'Pistáciová poleva',         null),
  ('Pistáciovo-malinový',  'Pistáciový krém — veterník', null),
  ('Pistáciovo-malinový',  'Malinová šľahačka',         null)
)
insert into product_recipes (product_id, recipe_id, qty_per_piece, pieces_per_batch)
select p.id, r.id, 1, v.kusov_z_davky::numeric
from vazba v
join products p on p.name = 'Veterník' and p.sub = v.prichut
join recipes r on r.name = v.recept
on conflict (product_id, recipe_id) do nothing;

-- ---------------------------------------------------------------------
-- KONTROLA PO SPUSTENÍ
-- ---------------------------------------------------------------------
select r.name as recept, r.kind as druh, r.yield_qty as vytaznost,
       count(distinct ri.id) as pocet_surovin,
       string_agg(distinct p.name || ' — ' || p.sub, ', ') as prichute,
       max(pr.pieces_per_batch) as kusov_z_davky
from recipes r
left join recipe_items ri on ri.recipe_id = r.id
left join product_recipes pr on pr.recipe_id = r.id
left join products p on p.id = pr.product_id
group by r.id, r.name, r.kind, r.yield_qty
order by r.kind, r.name;
