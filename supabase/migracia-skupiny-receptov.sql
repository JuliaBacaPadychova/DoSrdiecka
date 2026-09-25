-- ---------------------------------------------------------------------
-- MIGRÁCIA: skupiny receptov a poradie miešania
-- ---------------------------------------------------------------------
-- Spusti raz v Supabase -> SQL Editor -> New query.
--
-- Na poradí nezáleží: migrácia iba pridáva. Správa webu vie bežať aj
-- pred ňou — kým tabuľka skupín neexistuje, zoznam receptov vyzerá ako
-- doteraz (podľa abecedy, bez nadpisov) a nikde nespadne.
--
-- ČO TO ROBÍ
--
-- 1) Skupiny receptov ako vlastná tabuľka, nie pevný zoznam v kóde.
--    Majiteľka si ich vie pridať, premenovať aj preusporiadať v správe
--    webu. Predvolených je šesť: Cestá, Krémy, Vklady, Polevy, Ganáže,
--    Iné. Recept bez skupiny nezmizne — vypíše sa ako "Nezaradené".
--
--    (Kedysi mal recept stĺpec kind s pevným zoznamom druhov. Zrušili
--    sme ho, lebo to bolo políčko, ktoré treba vyplniť a nikto ho
--    nečítal. Toto je niečo iné: skupina riadi, čo majiteľka vidí,
--    a spravuje si ju sama.)
--
-- 2) Poradie receptov v rozpise ("čo mám miešať") pri KONKRÉTNEJ
--    príchuti — product_recipes.sort_order. Poradie závisí od prípravy,
--    nie od druhu: ganáž na ríbezle sa chladí tri hodiny, takže ide
--    prvá, hoci je to krém. Preto sa nastavuje pri príchuti, nie pri
--    recepte, a pri každej príchuti môže byť iné.
--
--    Nula znamená "nenastavené" — vtedy platí poradie skupín a v rámci
--    skupiny abeceda. Prvý klik šípkou v rozpise poradie očísluje.
--
-- Bezpečné spustiť aj opakovane — nič už zapísané sa neprepíše.
-- ---------------------------------------------------------------------

create table if not exists recipe_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

comment on table recipe_groups is
  'Skupiny receptov v správe webu (Cestá, Krémy, …). Spravuje si ich majiteľka, poradie drží sort_order.';

-- Rovnaká ochrana ako pri ostatných tabuľkách: do databázy sa chodí len
-- cez naše /api funkcie so service-role kľúčom, nikdy z prehliadača.
alter table recipe_groups enable row level security;

insert into recipe_groups (name, sort_order) values
  ('Cestá',  1),
  ('Krémy',  2),
  ('Vklady', 3),
  ('Polevy', 4),
  ('Ganáže', 5),
  ('Iné',    6)
on conflict (name) do nothing;

-- Zmazaná skupina nesmie vziať so sebou recepty — tie len prestanú byť
-- zaradené a vypíšu sa medzi Nezaradenými.
alter table recipes add column if not exists group_id uuid references recipe_groups(id) on delete set null;
create index if not exists recipes_group_id_idx on recipes(group_id);

-- ---------------------------------------------------------------------
-- PRVÉ ZARADENIE
--
-- Berie sa z pôvodného rozdelenia, ktoré recepty mali v stĺpci kind, a
-- dopĺňa recepty, ktoré pribudli neskôr (curdy, pavlova). Ganáže idú do
-- vlastnej skupiny, hoci v kinde boli vedené ako krémy.
--
-- Zaraďuje sa LEN recept, ktorý ešte skupinu nemá, a len podľa presného
-- názvu. Recept, ktorý si majiteľka premenovala alebo založila sama, sa
-- nechytí a ostane v Nezaradených — radšej nech si ho zaradí sama, než
-- aby ho skript hodil vedľa.
-- ---------------------------------------------------------------------
with zaradenie (recept, skupina) as (values
  ('Odpalované cesto',                  'Cestá'),
  ('Craquelin svetlý',                  'Cestá'),
  ('Craquelin tmavý',                   'Cestá'),
  ('Pavlova korpus',                    'Cestá'),
  ('Mangový krém',                      'Krémy'),
  ('Pistáciový krém',                   'Krémy'),
  ('Pistáciový krém — veterník',        'Krémy'),
  ('Vanilkový krém Suzys',              'Krémy'),
  ('Čokoládový krém',                   'Krémy'),
  ('Karamelová šľahačka',               'Krémy'),
  ('Malinová šľahačka',                 'Krémy'),
  ('Vanilková šľahačka',                'Krémy'),
  ('Pavlova krém',                      'Krémy'),
  ('Pavlova krém z čiernych ríbezlí',   'Krémy'),
  ('Jablkové confit',                   'Vklady'),
  ('Malinové coulis',                   'Vklady'),
  ('Višňové coulis',                    'Vklady'),
  ('Pavlova malinové coulis',           'Vklady'),
  ('Citrónový curd',                    'Vklady'),
  ('Malinový curd',                     'Vklady'),
  ('Karamelová poleva',                 'Polevy'),
  ('Pistáciová poleva',                 'Polevy'),
  ('Čokoládová poleva',                 'Polevy'),
  ('Kávová ganache',                    'Ganáže'),
  ('Mango šľahaná ganache',             'Ganáže'),
  ('Rebarborová šľahaná ganache',       'Ganáže'),
  ('Šľahaná ganache z bielej čokolády', 'Ganáže'),
  ('Slaný a sladký karamel',            'Iné')
)
update recipes r
   set group_id = g.id
  from zaradenie z
  join recipe_groups g on g.name = z.skupina
 where r.name = z.recept
   and r.group_id is null;

-- ---------------------------------------------------------------------
-- PORADIE MIEŠANIA PRI PRÍCHUTI
-- ---------------------------------------------------------------------
alter table product_recipes add column if not exists sort_order int not null default 0;

comment on column product_recipes.sort_order is
  'Poradie receptu v rozpise tejto príchute. 0 = nenastavené, vtedy platí poradie skupín a abeceda. Nastavuje sa šípkami v "Čo mám miešať".';

-- ---------------------------------------------------------------------
-- KONTROLA PO SPUSTENÍ
--
-- Vypíše skupiny v poradí a koľko receptov v nich je. Posledný riadok
-- (skupina prázdna) sú Nezaradené — tie treba v správe webu prehodiť.
-- ---------------------------------------------------------------------
select coalesce(g.name, '— Nezaradené —') as skupina,
       g.sort_order as poradie,
       count(r.id) as receptov,
       string_agg(r.name, ', ' order by r.name) as ktore
  from recipes r
  full join recipe_groups g on g.id = r.group_id
 group by g.id, g.name, g.sort_order
 order by g.sort_order nulls first;
