-- ---------------------------------------------------------------------
-- MIGRÁCIA: poradie surovín v recepte
-- ---------------------------------------------------------------------
-- Spusti raz v Supabase -> SQL Editor -> New query.
--
-- Suroviny v recepte doteraz nemali poradie — databáza ich vracala v
-- tom, v akom sa jej to hodilo, a pri každom načítaní to mohlo byť inak.
-- V recepte pritom na poradí záleží: najskôr sa zohreje mlieko, až potom
-- sa pridá múka.
--
-- Prvé naplnenie je približné: berie sa poradie, v akom sú riadky
-- fyzicky uložené, čo zhruba zodpovedá poradiu zadávania. Presné poradie
-- si majiteľka nastaví šípkami v správe webu.
--
-- Bezpečné spustiť aj opakovane — existujúce poradie sa neprepíše.
-- ---------------------------------------------------------------------

alter table recipe_items
  add column if not exists sort_order int not null default 0;

comment on column recipe_items.sort_order is
  'Poradie suroviny v recepte. Menšie číslo je vyššie.';

-- Naplní sa len tam, kde ešte nikto poradie nenastavil (všetko na nule).
with cislovanie as (
  select id, row_number() over (partition by recipe_id order by ctid) as poradie
    from recipe_items
   where recipe_id in (
     select recipe_id from recipe_items group by recipe_id having max(sort_order) = 0
   )
)
update recipe_items ri
   set sort_order = c.poradie
  from cislovanie c
 where ri.id = c.id;

select r.name as recept, ri.sort_order as poradie, i.name as surovina
  from recipes r
  join recipe_items ri on ri.recipe_id = r.id
  join ingredients i on i.id = ri.ingredient_id
 where r.name = 'Odpalované cesto'
 order by ri.sort_order;
