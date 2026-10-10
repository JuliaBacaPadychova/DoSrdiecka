-- ---------------------------------------------------------------------
-- PÄŤ KRÉMOV DO TORTY (18 cm, 10–12 porcií)
--
-- Z kurzových kariet. Do receptu idú LEN suroviny na krém — omáčka na
-- korpus, omáčka na doplnky, doplnky, ganáž aj karamelizované višne sú
-- v poznámke receptu, lebo to sú samostatné veci, ktoré sa pripravujú
-- zvlášť a do krému sa nemiešajú. Keby sa z nich mali raz stať vlastné
-- recepty, poznámka má všetko, čo na to treba.
--
-- POSTUP je skrátený na kroky, ktoré sa týkajú krému. Kroky o doplnkoch
-- a ganáži patria k tomu, čo je v poznámke, nie k tomuto receptu.
--
-- SMOTANA: karty píšu 35 %. V kartotéke je „Smotana na šľahanie 35 %
-- (malá)" (250 ml), takže sa použila tá — nie 33 % ani 40 %, ktoré sú
-- tam tiež. Recept je písaný v gramoch, surovina sa kupuje v mililitroch;
-- kým nebude pri surovine vyplnené „1 ml váži (g)", smotana do ceny
-- nevstúpi a správa webu to pri riadku napíše.
--
-- `layers` ostáva prázdne („vrstvami sa neriadi"). Karty hovoria
-- o 18 cm torte a 10–12 porciách, ale nie o tom, na koľko vrstiev krému
-- je dávka počítaná. Keď to budeš vedieť, doplň to v recepte.
--
-- Bezpečné spustiť aj opakovane: recept ani surovina, ktoré už existujú,
-- sa nezaložia druhýkrát a nič sa neprepíše. Len pridáva, takže môže
-- bežať aj pred nasadením; žiadna zmena kódu k nej nepatrí.
-- ---------------------------------------------------------------------

-- 1. Štyri suroviny, ktoré v kartotéke ešte nie sú. Balenie a cena sa
--    nevypĺňajú — doplníš ich v správe webu podľa obalu; dovtedy sa
--    v kalkulácii vypíšu ako nedoplnené, nie ako nula.
insert into ingredients (name, unit, pack_size, pack_price, price_source, note) values
  ('Mak mletý',              'g', null, null, 'kurzové karty', 'balenie a cenu doplniť podľa obalu'),
  ('Mak celý',               'g', null, null, 'kurzové karty', 'balenie a cenu doplniť podľa obalu'),
  ('Kokos strúhaný',         'g', null, null, 'kurzové karty', 'balenie a cenu doplniť podľa obalu'),
  ('Krém kokosovo-mandľový', 'g', null, null, 'kurzové karty', 'balenie a cenu doplniť podľa obalu')
on conflict (name) do nothing;

-- 2. Recepty. Skupina sa hľadá podľa názvu „Krémy do torty"; keby sa
--    medzitým volala inak, padne to späť na „Krémy". Keď nie je ani
--    jedna, recept vznikne bez skupiny a v správe webu si ju priradíš.
with skupina as (
  select id from recipe_groups
   where name in ('Krémy do torty', 'Krémy')
   order by case when name = 'Krémy do torty' then 0 else 1 end
   limit 1
), karta (nazov, postup, poznamka) as (values
  ('Čokoládový krém s višňami',
   E'KRÉM – tmavú čokoládu si roztopíme nad vodným kúpeľom alebo v mikrovlnke a necháme chvíľu vychladnúť.\n'
   'Vyšľaháme si všetky ostatné suroviny na kompaktný krém.\n'
   'Odoberieme z neho 2–3 PL do čokolády, vymiešame čokoládovú zmes a vrátime naspäť do krému.\n'
   'Krátko prešľaháme a odložíme na pol hodinu/hodinu do chladu.',
   E'Hodí sa: s karamelizovanými višňami a čokoládovou ganážou.\n\n'
   'Omáčka na korpus: 6–7 PL malinového pyré.\n\n'
   'Čokoládová ganáž: 60 g tmavá čokoláda 54 %, 30 g mliečna čokoláda 33 %, 90 g smotana na šľahanie 35 %. '
   'Tmavú a mliečnu čokoládu zalejeme smotanou a roztopíme nad vodným kúpeľom alebo v mikrovlnke.\n\n'
   'Karamelizované višne: 200 g kryštálového cukru, 500–600 g mrazených višní. '
   'Mrazené višne necháme povoliť a odkvapkať. Cukor roztopíme na karamel — nemiešame skôr, než sa začne prepaľovať prvý karamel. '
   'Do rozpusteného cukru vsypeme višne a chvíľu povaríme; ak pustia priveľa šťavy, zahustíme ich 1/2 ČL škrobu rozmiešaným v troške vody. '
   'Pred použitím necháme úplne vychladnúť.'),
  ('Krém z bielej čokolády s mandľami a kokosom',
   E'KRÉM – bielu čokoládu spolu s kokosovo-mandľovým krémom si roztopíme nad vodným kúpeľom alebo v mikrovlnke a necháme chvíľu vychladnúť.\n'
   'Vyšľaháme si všetky mliečne suroviny na kompaktný krém.\n'
   'Odoberieme z neho 2–3 PL do čokolády s kokosovo-mandľovým krémom, vymiešame čokoládovú zmes a vrátime naspäť do krému.\n'
   'Prisypeme strúhaný kokos, krátko prešľaháme a odložíme na pol hodinu/hodinu do chladu.',
   E'Hodí sa: s plátkami mandlí a mandľovo-kokosovým krémom.\n\n'
   'Omáčka na korpus: 5 PL karamel + 2 PL vody.\n\n'
   'Omáčka na doplnky: 5–7 PL kokosovo-mandľového krému.\n\n'
   'Doplnky: 180–200 g mandľových plátkov alebo hranolov. '
   'Pre intenzívnejšiu chuť ich môžeme krátko opiecť a nechať vychladnúť.'),
  ('Makový krém s ríbezľami a čučoriedkami',
   E'KRÉM – bielu čokoládu si roztopíme nad vodným kúpeľom alebo v mikrovlnke a necháme chvíľu vychladnúť.\n'
   'Vyšľaháme si všetky mliečne suroviny s cukrom na kompaktný krém.\n'
   'Odoberieme z neho 2–3 PL do čokolády, vymiešame čokoládovú zmes a vrátime naspäť do krému.\n'
   'Prisypeme mletý a celý mak, krátko prešľaháme a odložíme na pol hodinu/hodinu do chladu.',
   E'Hodí sa: s čiernymi ríbezľami, čučoriedkami a marakujovo-citrónovým curdom.\n\n'
   'Omáčka na korpus: 6–7 PL čučoriedkového pyré.\n\n'
   'Omáčka na doplnky: 5–7 PL marakujovo-citrónového curdu (podľa receptúry z kurzu).\n\n'
   'Doplnky: 150–200 g mrazených čiernych ríbezlí, 150–200 g čučoriedok. '
   'Mrazené ríbezle najprv necháme povoliť a odkvapkať, čučoriedky nakrájame na polovice.'),
  ('Krém z bielej čokolády s malinami a karamelom',
   E'KRÉM – bielu čokoládu si roztopíme nad vodným kúpeľom alebo v mikrovlnke a necháme chvíľu vychladnúť.\n'
   'Vyšľaháme si všetky mliečne suroviny s cukrom na kompaktný krém.\n'
   'Odoberieme z neho 2–3 PL do čokolády, vymiešame čokoládovú zmes a vrátime naspäť do krému.\n'
   'Krém krátko prešľaháme a odložíme na pol hodinu/hodinu do chladu.',
   E'Hodí sa: s malinami a karamelom.\n\n'
   'Omáčka na korpus: 6–7 PL malinového pyré.\n\n'
   'Omáčka na doplnky: 5–7 PL karamelu (podľa receptúry z kurzu).\n\n'
   'Doplnky: 500–600 g mrazených malín. Necháme ich povoliť a odkvapkať.'),
  ('Cream cheese krém s orechmi a slaným karamelom',
   E'KRÉM – bielu čokoládu si roztopíme nad vodným kúpeľom alebo v mikrovlnke a necháme chvíľu vychladnúť.\n'
   'Vyšľaháme si všetky mliečne suroviny s cukrom na kompaktný krém.\n'
   'Odoberieme z neho 2–3 PL do čokolády, vymiešame čokoládovú zmes a vrátime naspäť do krému.\n'
   'Krém krátko prešľaháme a odložíme na pol hodinu/hodinu do chladu.',
   E'Hodí sa: s bielou čokoládou, vlašskými orechmi a slaným karamelom.\n\n'
   'Omáčka na korpus: 5 PL karamel + 2 PL vody.\n\n'
   'Omáčka na doplnky: 5–7 PL slaného karamelu (podľa receptúry z kurzu).\n\n'
   'Doplnky: 180–200 g vlašských orechov. Nasekáme na polovice alebo menšie hrubšie kusy '
   'a pre intenzívnejšiu chuť krátko opečieme na panvici; necháme vychladnúť.')
)
insert into recipes (name, group_id, yield_qty, yield_unit, yield_label,
                     diameter_cm, layers, steps, note, active)
select k.nazov, (select id from skupina), 1, 'ks', 'tortu Ø 18 cm',
       18, null, k.postup,
       k.poznamka || E'\n\nZ kurzovej karty na tortu Ø 18 cm (10–12 porcií). '
       || 'V recepte sú len suroviny na krém; ostatné časti sa pripravujú zvlášť.',
       true
  from karta k
 where not exists (select 1 from recipes r where r.name = k.nazov);

-- 3. Suroviny v receptoch. Jednotka je 'g' všade, lebo tak sú karty
--    písané — aj pri smotane, ktorá sa kupuje v mililitroch.
with polozka (recept, surovina, mnozstvo, poradie) as (values
  ('Čokoládový krém s višňami',                     'Mascarpone',                      500, 1),
  ('Čokoládový krém s višňami',                     'Smotana na šľahanie 35% (malá)',  200, 2),
  ('Čokoládový krém s višňami',                     'Tvaroh tučný',                    140, 3),
  ('Čokoládový krém s višňami',                     'Čokoláda tmavá 54%',              165, 4),
  ('Čokoládový krém s višňami',                     'Cukor práškový',                  110, 5),

  ('Krém z bielej čokolády s mandľami a kokosom',   'Mascarpone',                      500, 1),
  ('Krém z bielej čokolády s mandľami a kokosom',   'Smotana na šľahanie 35% (malá)',  150, 2),
  ('Krém z bielej čokolády s mandľami a kokosom',   'Tvaroh tučný',                     80, 3),
  ('Krém z bielej čokolády s mandľami a kokosom',   'Čokoláda biela 28%',              150, 4),
  ('Krém z bielej čokolády s mandľami a kokosom',   'Krém kokosovo-mandľový',          100, 5),
  ('Krém z bielej čokolády s mandľami a kokosom',   'Kokos strúhaný',                   75, 6),
  ('Krém z bielej čokolády s mandľami a kokosom',   'Cukor práškový',                   60, 7),

  ('Makový krém s ríbezľami a čučoriedkami',        'Mascarpone',                      600, 1),
  ('Makový krém s ríbezľami a čučoriedkami',        'Smotana na šľahanie 35% (malá)',  120, 2),
  ('Makový krém s ríbezľami a čučoriedkami',        'Tvaroh tučný',                     60, 3),
  ('Makový krém s ríbezľami a čučoriedkami',        'Čokoláda biela 28%',              100, 4),
  ('Makový krém s ríbezľami a čučoriedkami',        'Cukor práškový',                   80, 5),
  ('Makový krém s ríbezľami a čučoriedkami',        'Mak mletý',                       100, 6),
  ('Makový krém s ríbezľami a čučoriedkami',        'Mak celý',                         20, 7),

  ('Krém z bielej čokolády s malinami a karamelom', 'Mascarpone',                      500, 1),
  ('Krém z bielej čokolády s malinami a karamelom', 'Smotana na šľahanie 35% (malá)',  170, 2),
  ('Krém z bielej čokolády s malinami a karamelom', 'Tvaroh tučný',                    100, 3),
  ('Krém z bielej čokolády s malinami a karamelom', 'Čokoláda biela 28%',              200, 4),
  ('Krém z bielej čokolády s malinami a karamelom', 'Cukor práškový',                   65, 5),

  ('Cream cheese krém s orechmi a slaným karamelom','Smotanový syr',                   500, 1),
  ('Cream cheese krém s orechmi a slaným karamelom','Mascarpone',                      150, 2),
  ('Cream cheese krém s orechmi a slaným karamelom','Smotana na šľahanie 35% (malá)',  120, 3),
  ('Cream cheese krém s orechmi a slaným karamelom','Čokoláda biela 28%',              200, 4),
  ('Cream cheese krém s orechmi a slaným karamelom','Cukor práškový',                   60, 5)
)
insert into recipe_items (recipe_id, ingredient_id, amount, unit, optional, note, sort_order)
select r.id, i.id, p.mnozstvo::numeric, 'g', false, '', p.poradie
  from polozka p
  join recipes r on r.name = p.recept
  join ingredients i on i.name = p.surovina
 where not exists (
   select 1 from recipe_items x
    where x.recipe_id = r.id and x.ingredient_id = i.id);

-- Kontrola na záver. Každý recept musí mať toľko surovín, koľko ich je
-- na karte; menej by znamenalo, že sa surovina nenašla podľa názvu.
select r.name,
       coalesce(g.name, '— bez skupiny —') as skupina,
       count(p.id) as surovin,
       sum(p.amount) as spolu_g
  from recipes r
  left join recipe_groups g on g.id = r.group_id
  left join recipe_items p on p.recipe_id = r.id
 where r.name in ('Čokoládový krém s višňami',
                  'Krém z bielej čokolády s mandľami a kokosom',
                  'Makový krém s ríbezľami a čučoriedkami',
                  'Krém z bielej čokolády s malinami a karamelom',
                  'Cream cheese krém s orechmi a slaným karamelom')
 group by r.id, r.name, g.name
 order by r.name;
