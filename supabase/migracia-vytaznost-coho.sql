-- ---------------------------------------------------------------------
-- MIGRÁCIA: čoho je recept napísaný na 10 kusov
-- ---------------------------------------------------------------------
-- Spusti raz v Supabase -> SQL Editor -> New query.
--
-- „Recept je na 10 ks" nepovie, na 10 kusov ČOHO. Pri kréme písanom na
-- 10 veterníkov je to podstatný rozdiel — z tej istej dávky vyjde iný
-- počet choux než veterníkov a bez toho slova sa to z rozpisu nedá
-- prečítať.
--
-- Je to voľný text, nie zoznam na výber: pomenovanie si volí majiteľka
-- („veterníkov", „choux", „na tortu Ø 18 cm") a nič sa podľa neho
-- nepočíta — prepočet drží `yield_qty` a `pieces_per_batch`.
--
-- Prázdne je v poriadku: recept bez popisu sa vypíše ako doteraz.
--
-- Bezpečné spustiť aj opakovane.
-- ---------------------------------------------------------------------

alter table recipes add column if not exists yield_label text not null default '';

select count(*) filter (where yield_label <> '') as vyplnenych,
       count(*) as receptov
  from recipes;
