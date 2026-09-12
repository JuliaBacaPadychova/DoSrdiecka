-- ---------------------------------------------------------------------
-- OPRAVA: technická poznámka pri odpalovanom ceste
-- ---------------------------------------------------------------------
-- Spusti raz v Supabase -> SQL Editor -> New query.
--
-- V poznámke pri recepte zostal názov databázového stĺpca
-- ("qty_per_piece"), čo v správe webu nikomu nič nehovorí. Nahrádza sa
-- vetou v jazyku, akým sa o tom rozpráva.
--
-- Maže sa len presne tento text, takže vlastnú poznámku neprepíše.
-- ---------------------------------------------------------------------

update recipes
   set note = 'To isté cesto vydá cca 12 veterníkov, 12 Paris-Brestov alebo 25 profiterolek — z jednej dávky teda vyjde menej veterníkov než choux.'
 where name = 'Odpalované cesto'
   and note like '%qty_per_piece%';

select name as recept, note as poznamka from recipes where note <> '' order by name;
