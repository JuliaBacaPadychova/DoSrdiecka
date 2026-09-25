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
-- Premenovaná skupina sa nechytí — rolu jej nastavíš v správe webu.
update recipe_groups set layer_role = 'korpus' where name = 'Cestá'  and layer_role is null;
update recipe_groups set layer_role = 'naplna' where name = 'Krémy'  and layer_role is null;
update recipe_groups set layer_role = 'naplna' where name = 'Vklady' and layer_role is null;

-- ---------------------------------------------------------------------
-- SKUPINA NA DISKY A MOUSSE
--
-- Vlastná skupina bez roly. Zakladá sa až na koniec zoznamu, aby
-- neprehádzala poradie, ktoré si majiteľka nastavila.
-- ---------------------------------------------------------------------
-- "on conflict" a nie "where not exists": agregačný select vráti riadok
-- aj vtedy, keď ho podmienka vyprázdni (max z ničoho je prázdno), takže
-- pri druhom spustení by sa skupina pokúsila vložiť znova.
insert into recipe_groups (name, sort_order)
select 'Disky a mousse', coalesce(max(sort_order), 0) + 1 from recipe_groups
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- ZARADENIE RECEPTOV NA BROWNIE TORTU
--
-- Migrácia brownie torty ich nechala nezaradené. Zaraďuje sa len recept,
-- ktorý ešte skupinu nemá — vlastné zaradenie ostáva.
-- ---------------------------------------------------------------------
with zaradenie (recept, skupina) as (values
  ('Brownie korpus',         'Cestá'),
  ('Brownie vanilkový krém', 'Krémy'),
  ('Brownie ovocné coulis',  'Vklady'),
  ('Brownie slaný karamel',  'Vklady'),
  ('Brownie ganache',        'Ganáže'),
  ('Malinový želé disk',     'Disky a mousse'),
  ('Malinový mousse',        'Disky a mousse'),
  ('Jahodové compoté',       'Disky a mousse'),
  ('Mangový mousse',         'Disky a mousse')
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
