-- ---------------------------------------------------------------------
-- BIELA OBTEROVÁ GANÁŽ NA OSEM PRIEMEROV
--
-- Z listu „Ganáž z bielej čokolády — prepočty surovín". Osem veľkostí
-- (12, 15, 18, 20, 22, 25, 28, 30 cm), každá ako vlastný recept
-- s číslami tak, ako sú napísané.
--
-- PREČO NIE JEDEN RECEPT A PREPOČET PLOCHOU:
-- tie čísla plochu nesledujú. Oproti prepočtu z 12 cm sú o 3 až 11 %
-- nižšie a nerastú rovnomerne. Dáva to zmysel — obter je povrch, a ten
-- je vrch (rastie s druhou mocninou priemeru) plus bok (rastie lineárne).
-- Keby sa to počítalo plochou, pri Ø 28 cm by vyšlo 1034 g čokolády
-- namiesto 940 g. Preto `diameter_cm` ukazuje na tortu, pre ktorú je
-- recept napísaný, a pri správnom priradení je koeficient 1.
--
-- MED je v liste navyše. Nie je to z listu — je to prenesené z receptu
-- „Brownie obterová ganache", kde med drží pomer 22 g na 185 g čokolády,
-- teda cca 12 %. V ganáži bráni kryštalizácii cukru a drží ju vláčnu.
-- Biela čokoláda je ale sama o sebe sladšia než horká, takže množstvo
-- môže byť vysoké — preto je med zapísaný ako VOLITEĽNÁ surovina
-- a v poznámke receptu je napísané, odkiaľ sa vzal. Odobrať sa dá
-- jedným klikom; keby mal zmiznúť zo všetkých naraz, povedz.
--
-- Postup sa nedopĺňa — v liste žiadny nie je a vymýšľať si ho by
-- znamenalo napísať do receptu niečo, čo nie je overené.
-- `layers` ostáva prázdne („vrstvami sa neriadi"). Z listu sa nedá
-- vyčítať, na koľko korpusov je obter počítaný; keď to budeš vedieť,
-- vyplň to v recepte ako pri brownie ganáži.
--
-- Bezpečné spustiť aj opakovane: recept, ktorý už existuje, sa preskočí
-- a jeho gramáže sa NEPREPÍŠU. Len pridáva, takže môže bežať aj pred
-- nasadením; žiadna zmena kódu k nej nepatrí.
-- ---------------------------------------------------------------------

insert into recipes (name, group_id, yield_qty, yield_unit, yield_label,
                     diameter_cm, layers, steps, note, active)
select 'Biela obterová ganáž Ø ' || v.priemer || ' cm',
       (select id from recipe_groups
         where name in ('Obterová ganáž', 'Ganáže')
         order by case when name = 'Obterová ganáž' then 0 else 1 end
         limit 1),
       1, 'ks', 'tortu Ø ' || v.priemer || ' cm',
       v.priemer, null, '',
       'Množstvá sú z listu „Ganáž z bielej čokolády" tak, ako sú tam '
       || 'napísané — neprepočítavajú sa plochou, lebo obter je povrch '
       || '(vrch rastie s druhou mocninou priemeru, bok lineárne) a čísla '
       || 'v liste tomu zodpovedajú. Preto má každá veľkosť vlastný recept. '
       || 'Med v liste nie je: je prevzatý z Brownie obterovej ganáže '
       || '(22 g na 185 g čokolády, cca 12 %), kde bráni kryštalizácii '
       || 'cukru. Biela čokoláda je sladšia než horká, takže ho pokojne '
       || 'uber alebo úplne odober — preto je označený ako voliteľný.',
       true
  from (values (12), (15), (18), (20), (22), (25), (28), (30)) as v(priemer)
 where not exists (
   select 1 from recipes r
    where r.name = 'Biela obterová ganáž Ø ' || v.priemer || ' cm');

with polozka (priemer, surovina, mnozstvo, poradie, volitelna, pozn) as (values
  (12, 'Čokoláda biela 28%',               190,  1, false, ''),
  (12, 'Smotana na šľahanie 33% (väčšia)',  80,  2, false, ''),
  (12, 'Maslo 82%',                         45,  3, false, ''),
  (12, 'Med',                               25,  4, true,  'alebo glukózový sirup; v liste nie je'),
  (15, 'Čokoláda biela 28%',               280,  1, false, ''),
  (15, 'Smotana na šľahanie 33% (väčšia)', 120,  2, false, ''),
  (15, 'Maslo 82%',                         65,  3, false, ''),
  (15, 'Med',                               35,  4, true,  'alebo glukózový sirup; v liste nie je'),
  (18, 'Čokoláda biela 28%',               380,  1, false, ''),
  (18, 'Smotana na šľahanie 33% (väčšia)', 160,  2, false, ''),
  (18, 'Maslo 82%',                         85,  3, false, ''),
  (18, 'Med',                               45,  4, true,  'alebo glukózový sirup; v liste nie je'),
  (20, 'Čokoláda biela 28%',               475,  1, false, ''),
  (20, 'Smotana na šľahanie 33% (väčšia)', 200,  2, false, ''),
  (20, 'Maslo 82%',                        110,  3, false, ''),
  (20, 'Med',                               55,  4, true,  'alebo glukózový sirup; v liste nie je'),
  (22, 'Čokoláda biela 28%',               665,  1, false, ''),
  (22, 'Smotana na šľahanie 33% (väčšia)', 280,  2, false, ''),
  (22, 'Maslo 82%',                        145,  3, false, ''),
  (22, 'Med',                               80,  4, true,  'alebo glukózový sirup; v liste nie je'),
  (25, 'Čokoláda biela 28%',               800,  1, false, ''),
  (25, 'Smotana na šľahanie 33% (väčšia)', 335,  2, false, ''),
  (25, 'Maslo 82%',                        175,  3, false, ''),
  (25, 'Med',                               95,  4, true,  'alebo glukózový sirup; v liste nie je'),
  (28, 'Čokoláda biela 28%',               940,  1, false, ''),
  (28, 'Smotana na šľahanie 33% (väčšia)', 400,  2, false, ''),
  (28, 'Maslo 82%',                        215,  3, false, ''),
  (28, 'Med',                              110,  4, true,  'alebo glukózový sirup; v liste nie je'),
  (30, 'Čokoláda biela 28%',              1080,  1, false, ''),
  (30, 'Smotana na šľahanie 33% (väčšia)', 460,  2, false, ''),
  (30, 'Maslo 82%',                        245,  3, false, ''),
  (30, 'Med',                              130,  4, true,  'alebo glukózový sirup; v liste nie je')
)
insert into recipe_items (recipe_id, ingredient_id, amount, unit, optional,
                          note, sort_order)
-- Jednotka je 'g' aj pri smotane: list je písaný vo váhe. Smotana sa
-- kupuje v mililitroch, takže kým surovina nemá vyplnené „1 ml váži (g)",
-- do ceny nevstúpi a správa webu to pri riadku napíše.
select r.id, i.id, p.mnozstvo::numeric, 'g', p.volitelna, p.pozn, p.poradie
  from polozka p
  join recipes r on r.name = 'Biela obterová ganáž Ø ' || p.priemer || ' cm'
  join ingredients i on i.name = p.surovina
 where not exists (
   select 1 from recipe_items x
    where x.recipe_id = r.id and x.ingredient_id = i.id);

-- Kontrola na záver: čo sa založilo a či niektorému receptu nechýba
-- surovina (to by znamenalo, že sa nenašla podľa názvu).
select r.name, r.diameter_cm as priemer_torty,
       count(p.id) as surovin,
       sum(case when p.optional then 0 else p.amount end) as spolu_g_bez_medu
  from recipes r
  left join recipe_items p on p.recipe_id = r.id
 where r.name like 'Biela obterová ganáž %'
 group by r.id, r.name, r.diameter_cm
 order by r.diameter_cm;
