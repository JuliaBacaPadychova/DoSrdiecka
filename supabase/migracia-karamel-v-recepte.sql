-- ---------------------------------------------------------------------
-- MIGRÁCIA: karamel viditeľný aj v poleve a šľahačke
-- ---------------------------------------------------------------------
-- Spusti raz v Supabase -> SQL Editor -> New query.
-- Až po migracia-veterniky.sql.
--
-- Karamel sa nekupuje, varí sa z receptu "Slaný a sladký karamel". Do
-- polevy sa z neho berie 240 g slaného, do šľahačky 250 g sladkého.
--
-- Aby to bolo v receptoch vidieť, ale cena sa nerátala dvakrát, vzniká
-- surovina "Karamel (vlastný)" označená ako nerátaná do ceny. Peniaze
-- za ňu sú v recepte na karamel — cukor, smotana a maslo.
--
-- Kúpený "Karamel" v číselníku ostáva, keby sa niekedy zišiel.
--
-- Bezpečné spustiť aj opakovane.
-- ---------------------------------------------------------------------

insert into ingredients (name, unit, negligible, note) values
  ('Karamel (vlastný)', 'g', true,
   'Varí sa z receptu Slaný a sladký karamel — cena je tam. Tu sa neráta, aby sa nepočítala dvakrát.')
on conflict (name) do nothing;

with polozka (recept, mnozstvo, pozn) as (values
  ('Karamelová poleva',   240, 'slaný, z dávky karamelu — pomer karamel : čokoláda je 4:1'),
  ('Karamelová šľahačka', 250, 'sladký, z dávky karamelu')
)
insert into recipe_items (recipe_id, ingredient_id, amount, optional, note)
select r.id, i.id, p.mnozstvo::numeric, false, p.pozn
from polozka p
join recipes r on r.name = p.recept
join ingredients i on i.name = 'Karamel (vlastný)'
on conflict (recipe_id, ingredient_id) do nothing;

update recipes
   set note = 'Karamel sa berie z dávky receptu Slaný a sladký karamel. V surovinách je uvedený, ale do ceny sa neráta — tá je v recepte na karamel.'
 where name in ('Karamelová poleva', 'Karamelová šľahačka')
   and note like '%samostatn%';

select r.name as recept, i.name as surovina, ri.amount as mnozstvo,
       case when i.negligible then 'cena v inom recepte' else '' end as poznamka
  from recipes r
  join recipe_items ri on ri.recipe_id = r.id
  join ingredients i on i.id = ri.ingredient_id
 where r.name in ('Slaný a sladký karamel', 'Karamelová poleva', 'Karamelová šľahačka')
 order by r.name, i.name;
