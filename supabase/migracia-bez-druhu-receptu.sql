-- ---------------------------------------------------------------------
-- MIGRÁCIA: recept už nemá druh
-- ---------------------------------------------------------------------
-- Spusti raz v Supabase -> SQL Editor -> New query, ale AŽ POTOM, čo je
-- na webe nasadená verzia kódu, ktorá s druhom už nepočíta.
--
-- Poradie je dôležité: staršie znenie `api/admin/receptar.js` si recepty
-- pýta zoradené podľa `kind`. Keď sa stĺpec zmaže skôr, než sa nasadí
-- nový kód, Supabase tú požiadavku odmietne a v správe webu sa celá
-- záložka Recepty (a s ňou Kalkulačka aj Peniaze) ozve ako
-- "server_error". Nič sa tým nepokazí — po nasadení je to zase v poriadku.
--
-- Keby sa to predsa stalo a web treba sfunkčniť hneď, stĺpec sa dá
-- dočasne vrátiť (prázdny, len aby bolo podľa čoho radiť):
--
--   alter table recipes add column if not exists kind text not null default 'krem';
--
-- a po nasadení nového kódu spustiť túto migráciu znova.
--
-- Recept mal popri názve ešte druh (cesto / krém / vklad / poleva /
-- ozdoba / iné). Nikde sa podľa neho nepočítalo a z hlavičiek receptov
-- zmizol už skôr — ostávalo len políčko, ktoré treba pri zakladaní
-- receptu vyplniť a potom ho nikto nečíta. Že je "Malinový curd" vklad,
-- je vidieť z názvu.
--
-- Poradie v rozpise ("čo mám miešať") sa doteraz riadilo druhom —
-- najprv cesto, potom náplne. Teraz je podľa abecedy, rovnako ako
-- v úprave receptov a vo výberoch: recept je tam, kam ho kladie názov.
--
-- POZOR: stĺpec sa zmaže aj s obsahom a späť sa nedá vrátiť. Nič iné
-- v databáze od neho nezávisí — nie je v žiadnom pohľade ani funkcii.
--
-- Druh SUROVINY (surovina / obal / réžia) sa tým nemení, ten ostáva:
-- podľa neho sa réžia a obaly rátajú na kus, nie na gramy.
--
-- Bezpečné spustiť aj opakovane — "if exists" druhýkrát nič neurobí.
-- ---------------------------------------------------------------------

alter table recipes drop column if exists kind;

-- Kontrola: recepty sa načítajú a stĺpec "kind" medzi nimi už nie je.
select name as recept, yield_qty as vytaznost, yield_unit as jednotka,
       yield_label as coho
  from recipes
 order by name;
