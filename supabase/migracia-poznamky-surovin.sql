-- ---------------------------------------------------------------------
-- MIGRÁCIA: preč s poznámkami, ktoré pri surovinách vypísala migrácia
-- ---------------------------------------------------------------------
-- Spusti raz v Supabase -> SQL Editor -> New query.
--
-- Poznámky typu "cenu aj balenie doplniť" boli len odkaz pri
-- odovzdávaní — majiteľka o chýbajúcich cenách vie a v tabuľke ich
-- označuje červené "doplniť", ktoré sa počíta zo stavu riadku. Dve
-- upozornenia na to isté sú o jedno viac.
--
-- Maže sa len presne tento text, nie čokoľvek v poznámke. Vlastná
-- poznámka napísaná v správe webu preto ostane nedotknutá, aj keby sa
-- skript spustil znovu.
-- ---------------------------------------------------------------------

update ingredients
   set note = ''
 where note in (
   'cenu aj balenie doplniť',
   'cena z excelu, gramáž balenia doplniť podľa obalu',
   'mletá vanilka; 20 g z excelu — overiť podľa obalu',
   'balenie doplniť podľa obalu',
   'kupuje sa podľa dostupnosti — cenu vpísať po nákupe',
   'do ceny sa neráta',
   'Silver 180 bloom, 1 plátok = 5 g',
   'Philadelphia a podobné'
 );

-- Kontrola: ktoré suroviny ešte majú poznámku. Po spustení by tu mali
-- byť už len tie, ktoré si napísala sama (na začiatku žiadne).
select name as surovina, note as poznamka
  from ingredients
 where note <> ''
 order by name;
