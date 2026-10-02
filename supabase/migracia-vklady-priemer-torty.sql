-- ---------------------------------------------------------------------
-- VKLADY: „PRIEMER TORTY" JE PRIEMER TORTY, NIE DISKU
--
-- Disk sa do torty nedáva na celú plochu — je aspoň o 2 cm menší, aby
-- ho obložil krém. Do 18 cm torty ide 16 cm mousse, do 16 cm torty
-- 14 cm mousse a tak ďalej.
--
-- Políčko `recipes.diameter_cm` znamená „na aký priemer TORTY je recept
-- napísaný" — podľa neho sa recept prepočítava, keď sa priradí k inej
-- veľkosti. Vklady ho ale mali vyplnené priemerom samotného disku, takže
-- sa prepočítavali aj vtedy, keď prepočet nemal prečo nastať: malinový
-- mousse na Ø 18 cm torte sa násobil (18/16)² = 1,27, hoci ten disk JE
-- ten správny pre 18 cm tortu a koeficient má byť 1.
--
-- Že to tak má byť, stálo už v poznámke jahodového compoté:
-- „Vklad Ø 16 cm ide do 18 cm torty."
--
-- Priemer disku sa nestráca — je v názve aj v „Kusov čoho" (disk Ø 14 cm).
--
-- Opravuje sa to NEZÁVISLE OD NÁZVOV: chytí sa každý recept, ktorý má
-- v popise výťažnosti „disk Ø N cm" alebo „vklad Ø N cm" a v priemere
-- stále to isté N. Recept, ktorý už má priemer torty vyplnený správne
-- (napr. ručne opravený), sa nechytí — N sa nerovná N+2. Z toho plynie
-- aj to, že migrácia je bezpečná opakovane.
--
-- Len mení hodnotu v už existujúcom stĺpci, takže môže bežať aj pred
-- nasadením; žiadna zmena kódu k nej nepatrí.
-- ---------------------------------------------------------------------

update recipes
   set diameter_cm = diameter_cm + 2
 where diameter_cm is not null
   and yield_label ~ '^(disk|vklad) Ø [0-9]+ cm$'
   and diameter_cm = nullif(regexp_replace(yield_label, '[^0-9]', '', 'g'), '')::numeric;
