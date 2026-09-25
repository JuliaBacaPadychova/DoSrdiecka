-- ---------------------------------------------------------------------
-- MIGRÁCIA: počet korpusov a náplní sa zadáva raz pre celú tortu
-- ---------------------------------------------------------------------
-- Spusti raz v Supabase -> SQL Editor -> New query.
-- Na poradí nezáleží, migrácia iba pridáva.
--
-- Doteraz sa počet vrstiev prepisoval pri každom recepte zvlášť. Pri
-- štyroch zložkách to znamená štyri kliknutia na to isté rozhodnutie
-- ("robím 3 korpusy a 2 náplne"). Preto sa to zadáva raz hore nad
-- rozpisom a prepočíta sa všetko naraz.
--
-- Aby to web vedel rozdeliť, musí poznať, ČÍM zložka v torte je. Drží to
-- skupina receptu — tá už existuje a majiteľka si ju spravuje sama:
--
--   layer_role = 'korpus'  -> riadi sa políčkom "Korpusov"
--   layer_role = 'naplna'  -> riadi sa políčkom "Náplní"
--   prázdne                -> vrstvami sa neriadi (obter, poleva, disk)
--
-- Disk ani mousse sa vrstvami riadiť nesmú: do torty ide jeden disk bez
-- ohľadu na to, koľko je korpusov. Preto dostávajú vlastnú skupinu bez
-- roly — keby boli medzi Vkladmi, zmena počtu náplní by ich zdvojila.
--
-- Bezpečné spustiť aj opakovane — vlastné nastavenie sa neprepíše.
-- ---------------------------------------------------------------------

alter table recipe_groups add column if not exists layer_role text
  check (layer_role in ('korpus', 'naplna'));

comment on column recipe_groups.layer_role is
  'Čím je zložka z tejto skupiny v torte: korpus, náplň, alebo prázdne = vrstvami sa neriadi (obter, poleva, disk).';

-- Priradí sa len tam, kde ešte rola nie je, a podľa názvu skupiny.
-- Premenovaná alebo vlastná skupina sa nechytí — rolu jej nastavíš
-- v správe webu výberom "V torte je to".
--
-- Korpus nie je cesto: tortový korpus má vlastnú skupinu, hoci odpalované
-- cesto na choux je tiež cesto. Preto sú v zozname obe mená — ak máš
-- skupinu Korpusy, rolu dostane ona; ak nie, dostanú ju Cestá.
update recipe_groups set layer_role = 'korpus' where name = 'Korpusy' and layer_role is null;
update recipe_groups set layer_role = 'korpus' where name = 'Cestá'
  and layer_role is null
  and not exists (select 1 from recipe_groups where name = 'Korpusy');
update recipe_groups set layer_role = 'naplna' where name = 'Krémy'  and layer_role is null;
update recipe_groups set layer_role = 'naplna' where name = 'Vklady' and layer_role is null;

-- ---------------------------------------------------------------------
-- DISKY A MOUSSE SA VRSTVAMI NERIADIŤ NESMÚ
--
-- Patria medzi Vklady, ale do torty ide jeden disk bez ohľadu na to,
-- koľko je korpusov. Vklady majú rolu náplne, takže keby bol disk vedený
-- ako recept "na 1 vrstvu", zmena počtu náplní na 2 by ho ZDVOJILA.
--
-- Prázdne "na koľko vrstiev" znamená "vrstvami sa neriadi" — a to je pri
-- diskoch, mousse aj obterovej ganáži to správne. Migrácia brownie torty
-- im dala jednotku, tak sa to opravuje; recept s iným číslom sa nechytí,
-- lebo to už je vedomé nastavenie.
-- ---------------------------------------------------------------------
update recipes
   set layers = null
 where name in ('Malinový želé disk', 'Malinový mousse', 'Jahodové compoté',
                'Mangový mousse', 'Brownie ganache')
   and layers = 1;

-- ---------------------------------------------------------------------
-- ZARADENIE RECEPTOV NA BROWNIE TORTU
--
-- Migrácia brownie torty ich nechala nezaradené. Zaraďuje sa len recept,
-- ktorý ešte skupinu nemá — vlastné zaradenie ostáva.
-- ---------------------------------------------------------------------
with zaradenie (recept, skupina) as (values
  -- Korpus ide do skupiny Korpusy, keď taká je; inak medzi Cestá.
  ('Brownie korpus',         coalesce((select name from recipe_groups where name = 'Korpusy'), 'Cestá')),
  ('Brownie vanilkový krém', 'Krémy'),
  ('Brownie ovocné coulis',  'Vklady'),
  ('Brownie slaný karamel',  'Vklady'),
  -- Obterová ganáž je iná vec než šľahané ganáže do zákuskov, preto má
  -- vlastnú skupinu. Ak si ju majiteľka premenovala, ide do nej; inak
  -- medzi Ganáže.
  ('Brownie ganache',        coalesce((select name from recipe_groups where name = 'Obterová ganáž'), 'Ganáže')),
  ('Malinový želé disk',     'Vklady'),
  ('Malinový mousse',        'Vklady'),
  ('Jahodové compoté',       'Vklady'),
  ('Mangový mousse',         'Vklady')
)
update recipes r
   set group_id = g.id
  from zaradenie z
  join recipe_groups g on g.name = z.skupina
 where r.name = z.recept
   and r.group_id is null;

-- ---------------------------------------------------------------------
-- KONTROLA PO SPUSTENÍ
--
-- Cestá majú byť korpus, Krémy a Vklady náplň, zvyšok prázdny.
-- ---------------------------------------------------------------------
select g.name as skupina, g.sort_order as poradie,
       coalesce(g.layer_role, '— neriadi sa vrstvami —') as rola,
       count(r.id) as receptov,
       string_agg(r.name, ', ' order by r.name) as ktore
  from recipe_groups g
  left join recipes r on r.group_id = g.id
 group by g.id, g.name, g.sort_order, g.layer_role
 order by g.sort_order;

-- Recepty na tortu a to, čím sa riadia. Disky, mousse a obterová ganáž
-- majú mať vo vrstvách prázdno — inak by ich hromadné políčko zdvojilo.
select r.name as recept, r.diameter_cm as priemer,
       coalesce(r.layers::text, '— neriadi sa vrstvami —') as vrstiev,
       coalesce(g.name, '— nezaradený —') as skupina
  from recipes r
  left join recipe_groups g on g.id = r.group_id
 where r.diameter_cm is not null
 order by r.name;
