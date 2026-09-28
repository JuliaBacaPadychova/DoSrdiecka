-- ---------------------------------------------------------------------
-- MIGRÁCIA: dorovnanie kópií počtu vrstiev pri tortách
-- ---------------------------------------------------------------------
-- Spusti raz v Supabase -> SQL Editor -> New query.
-- Na poradí nezáleží, nič sa nepridáva ani nemaže.
--
-- PREČO EŠTE RAZ
--
-- migracia-vrstvy-vazby.sql hľadala recepty podľa názvu ('Brownie
-- ganache'). Lenže premenovaný recept sa tak nenájde — obterová ganáž sa
-- medzitým volá inak a jej priradenia ostali na jednotke. Prejavilo sa to
-- ako štvrtinová dávka ganáže.
--
-- Preto sa to tu robí bez názvov: vyprázdni sa počet vrstiev pri VŠETKÝCH
-- priradeniach k tortám (výrobok s priemerom). To číslo má zmysel len ako
-- vedomá odchýlka pre jednu veľkosť — "táto dvadsaťdvojka má natrvalo
-- o korpus viac" — a takú zatiaľ nikto nenastavil; jednorazový prepočet
-- sa robí v "Čo mám miešať" a nikam sa neukladá.
--
-- Bezpečné spustiť aj opakovane. Ak si po ňom niekde vedomú odchýlku
-- nastavíš, už ti ju nič neprepíše — migrácia sa spúšťa raz.
-- ---------------------------------------------------------------------

update product_recipes pr
   set layers = null
  from products p
 where p.id = pr.product_id
   and p.diameter_cm is not null
   and pr.layers is not null;

-- ---------------------------------------------------------------------
-- KONTROLA PO SPUSTENÍ
--
-- Vo všetkých riadkoch má byť "— ako recept —". Stĺpec vedľa hovorí,
-- čím sa teda zložka riadi.
-- ---------------------------------------------------------------------
select p.name || ' — ' || p.sub as velkost,
       r.name as recept,
       coalesce(r.layers::text, '— neriadi sa vrstvami —') as na_kolko_je_recept,
       coalesce(pr.layers::text, '— ako recept —') as vrstiev_v_torte
  from product_recipes pr
  join products p on p.id = pr.product_id
  join recipes r on r.id = pr.recipe_id
 where p.diameter_cm is not null
 order by p.diameter_cm, r.name;
