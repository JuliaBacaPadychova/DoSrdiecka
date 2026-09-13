-- ---------------------------------------------------------------------
-- MIGRÁCIA: gramáže zo stĺpca "v gramoch"
-- ---------------------------------------------------------------------
-- Spusti raz v Supabase -> SQL Editor -> New query.
-- Až po migracia-veterniky.sql.
--
-- Pri veterníkoch som pôvodne prebral gramáže z hárkov "Kalkulacka",
-- lebo sa zhodovali s textom receptu. Stĺpec "v gramoch" je ale
-- novší — sú to poznámky po úpravách. Preto sa prepisuje na jeho
-- hodnoty.
--
-- Vanilkový krém Suzys sa zámerne nedotýka: tam sa líšia všetky tri
-- zdroje (480 / 380 / 280 g mascarpone) a majiteľka si ho upraví sama.
--
-- Každý riadok sa prepíše len vtedy, keď má ešte pôvodnú hodnotu. Keby
-- ju medzitým niekto v správe webu zmenil, skript ju neprevalcuje a dá
-- sa spustiť aj opakovane.
-- ---------------------------------------------------------------------

with zmena (recept, surovina, zo, na) as (values
  ('Malinová šľahačka',  'Mascarpone',                30,  100),
  ('Malinová šľahačka',  'Smotana na šľahanie 40%',   150, 200),
  ('Vanilková šľahačka', 'Mascarpone',                80,  100),
  ('Vanilková šľahačka', 'Smotana na šľahanie 40%',   220, 300),
  ('Vanilková šľahačka', 'Cukor práškový',            40,  50)
)
update recipe_items ri
   set amount = z.na::numeric
  from zmena z, recipes r, ingredients i
 where ri.recipe_id = r.id and ri.ingredient_id = i.id
   and r.name = z.recept and i.name = z.surovina
   and ri.amount = z.zo::numeric;

-- Vanilka vo vanilkovej šľahačke mala prázdnu gramáž ("⅓ ČL"), v stĺpci
-- je 0,5 g. Dopĺňa sa len tam, kde je prázdna.
update recipe_items ri
   set amount = 0.5, note = '⅓ ČL, v exceli 0,5 g'
  from recipes r, ingredients i
 where ri.recipe_id = r.id and ri.ingredient_id = i.id
   and r.name = 'Vanilková šľahačka' and i.name = 'Vanilka'
   and ri.amount is null;

-- Kontrola: gramáže veterníkových krémov a šľahačiek po prepise.
select r.name as recept, i.name as surovina, ri.amount as mnozstvo
  from recipes r
  join recipe_items ri on ri.recipe_id = r.id
  join ingredients i on i.id = ri.ingredient_id
 where r.name in ('Malinová šľahačka', 'Vanilková šľahačka', 'Vanilkový krém Suzys')
 order by r.name, i.name;
