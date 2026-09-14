-- ---------------------------------------------------------------------
-- MIGRÁCIA: doplnenie „kusov čoho" k existujúcim receptom
-- ---------------------------------------------------------------------
-- Spusti raz v Supabase -> SQL Editor -> New query.
-- Až po migracia-vytaznost-coho.sql.
--
-- Políčko „kusov čoho" pribudlo prázdne a vypĺňať ho pri každom recepte
-- ručne je zbytočná práca. Dá sa odvodiť: recept priradený k veterníkom
-- je napísaný na veterníky.
--
-- Dopĺňa sa LEN tam, kde:
--   * je políčko ešte prázdne — čo si vyplnila sama, sa neprepíše,
--   * je recept písaný na kusy (pri gramoch by „10 g veterník" nedávalo
--     zmysel; tam si popis dopíšeš sama, napr. „karamelu"),
--   * všetky príchute receptu patria k tomu istému výrobku. Karamel ide
--     do choux aj do veterníkov, takže pri ňom sa nedá povedať jedno
--     slovo — ostáva prázdny.
--
-- Bezpečné spustiť aj opakovane.
-- ---------------------------------------------------------------------

with jednoznacne as (
  select pr.recipe_id, min(p.name) as vyrobok
    from product_recipes pr
    join products p on p.id = pr.product_id
   group by pr.recipe_id
  having count(distinct p.name) = 1
)
update recipes r
   set yield_label = lower(j.vyrobok)
  from jednoznacne j
 where r.id = j.recipe_id
   and r.yield_label = ''
   and r.yield_unit = 'ks';

select r.name as recept,
       r.yield_qty as na_kusov,
       case when r.yield_label = '' then '— doplň sama —' else r.yield_label end as kusov_coho,
       coalesce(string_agg(distinct p.name || ' — ' || p.sub, ', '), 'nepriradený') as prichute
  from recipes r
  left join product_recipes pr on pr.recipe_id = r.id
  left join products p on p.id = pr.product_id
 group by r.id, r.name, r.yield_qty, r.yield_label
 order by r.name;
