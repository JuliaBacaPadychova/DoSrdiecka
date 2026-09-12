-- ---------------------------------------------------------------------
-- OPRAVA: výťažnosť receptu prešmyknutá o tisíciny
-- ---------------------------------------------------------------------
-- Spusti raz v Supabase -> SQL Editor -> New query.
--
-- Políčko "recept je napísaný na X ks" malo v správe webu krok 0,001,
-- takže sa šípkou dalo posunúť o tisícinu — a z 20 ks sa stalo 20,002.
-- Políčko je odvtedy preč, ale hodnotu treba narovnať.
--
-- Opravuje sa len odchýlka menšia než stotina, čiže presne také
-- prešmyknutie. Zámerné hodnoty (coulis na 150 g) sa nedotýka a skript
-- sa dá spustiť aj opakovane.
-- ---------------------------------------------------------------------

update recipes
   set yield_qty = round(yield_qty)
 where yield_qty <> round(yield_qty)
   and abs(yield_qty - round(yield_qty)) < 0.01;

-- Kontrola: na koľko je ktorý recept napísaný. Čísla majú byť okrúhle
-- (8, 10, 12, 20 kusov; coulis 150 g).
select name as recept, kind as druh, yield_qty as vytaznost, yield_unit as jednotka
  from recipes
 order by kind, name;
