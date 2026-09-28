-- ---------------------------------------------------------------------
-- MIGRÁCIA: priradenie prestane držať kópiu počtu vrstiev
-- ---------------------------------------------------------------------
-- Spusti raz v Supabase -> SQL Editor -> New query.
-- Na poradí nezáleží, migrácia nič nepridáva ani nemaže — len uvoľní
-- údaj, ktorý tam nemal byť.
--
-- ČO SA POKAZILO
--
-- product_recipes.layers znamená "koľko vrstiev TEJTO zložky ide do
-- TEJTO torty" a je to vedomý zásah: prázdne = platí to, na čo je recept
-- napísaný. Migrácia brownie torty ho ale vyplnila sama (r.layers), čiže
-- z každého priradenia spravila trvalý zásah, hoci nikto nič nerozhodol.
--
-- Prejavilo sa to na obterovej ganáži. Tá mala vtedy layers = 1, takže
-- sa jednotka odkopírovala do priradenia. Keď potom majiteľka receptu
-- správne nastavila, že je napísaný na 4 korpusy, priradenie stále
-- hovorilo "do tejto torty ide 1 vrstva" — a z toho vyšlo 1/4, čiže
-- štvrtinová dávka ganáže namiesto celej.
--
-- ČO S TÝM
--
-- Vyprázdni sa kópia tam, kde sa rovná tomu, čo migrácia vpísala. Vlastné
-- číslo, ktoré si majiteľka nastavila sama, sa nechytí — to je naozaj
-- vedomý zásah a má ostať.
-- ---------------------------------------------------------------------

with predvolene (recept, vpisala_migracia) as (values
  ('Brownie korpus',         4),
  ('Brownie vanilkový krém', 3),
  ('Brownie ovocné coulis',  3),
  ('Brownie slaný karamel',  3),
  ('Brownie ganache',        1)
)
update product_recipes pr
   set layers = null
  from predvolene p
  join recipes r on r.name = p.recept
 where pr.recipe_id = r.id
   and pr.layers = p.vpisala_migracia;

-- ---------------------------------------------------------------------
-- KONTROLA PO SPUSTENÍ
--
-- Stĺpec "vrstiev v torte" má byť prázdny = platí recept. Stĺpec
-- "na koľko je recept" ukazuje, čím sa teda zložka riadi.
-- ---------------------------------------------------------------------
select r.name as recept,
       coalesce(r.layers::text, '— neriadi sa vrstvami —') as na_kolko_je_recept,
       coalesce(pr.layers::text, '— ako recept —') as vrstiev_v_torte,
       count(*) as velkosti
  from product_recipes pr
  join recipes r on r.id = pr.recipe_id
  join products p on p.id = pr.product_id
 where p.name = 'Brownie torta'
 group by r.name, r.layers, pr.layers
 order by r.name;
