-- Do srdiečka — veľkosti pri tortách
--
-- Torty používajú ten istý mechanizmus ako príchute pri zákuskoch:
-- výrobky s rovnakým názvom v tej istej kategórii sa spoja do jednej
-- karty a podnadpisy sa ukážu ako možnosti. Pri tortách to web pomenuje
-- "Veľkosti" namiesto "Príchute".
--
-- Čo majú všetky veľkosti rovnaké (popis, alergény), karta napíše raz;
-- cena sa líši, tak je pri každej veľkosti zvlášť.
--
-- Denný limit ostáva 1 torta na deň bez ohľadu na veľkosť.
--
-- Skript je bezpečné spustiť aj viackrát.

-- 1) Väčšie veľkosti brownie torty. Popis aj alergény sú rovnaké ako pri
--    dvanástke, líši sa len priemer a cena.
insert into products
  (category_id, name, sub, description, alt_text, price, min_qty, min_label, allergens, image_url, sort_order)
select 'torty', 'Brownie torta', v.sub,
  'Vanilkový krém, ovocné coulis, slaný karamel, čokoládová ganache z horkej čokolády.',
  '', v.cena, 1, '', '1, 3, 6, 7', '/assets/img/brownie.jpg', v.poradie
from (values
  ('Ø 16 cm', 50, 2),
  ('Ø 18 cm', 60, 3),
  ('Ø 20 cm', 70, 4),
  ('Ø 22 cm', 80, 5)
) as v(sub, cena, poradie)
where not exists (
  select 1 from products where name = 'Brownie torta' and sub = v.sub
);

-- 2) Poznámka "Alt.: bez laktózy · veľkosti Ø 16 / 18 / 20 / 22 cm." ide
--    preč — veľkosti sú teraz plnohodnotné možnosti.
update products
  set alt_text = ''
  where name = 'Brownie torta' and alt_text <> '';

-- 3) Pri pavlova torte nahradí poznámku prosba o ovocie.
update products
  set description = 'Vanilkový krém, ovocné coulis.',
      alt_text = 'Napíš mi do poznámky predstavu aké ovocie preferuješ.'
  where name = 'Pavlova torta';

-- 4) Popisok "za tortu" už netreba: cena pri tortách sa píše bez "/ks",
--    takže "od 40 €" sa samo číta ako cena za tortu.
update products
  set min_label = ''
  where category_id = 'torty' and min_label <> '';

-- 5) Poradie v kategórii Torty. Každý riadok potrebuje vlastné číslo,
--    inak databáza vráti veľkosti jednej torty v náhodnom poradí.
update products set sort_order = 1 where name = 'Brownie torta' and sub = 'Ø 12 cm';
update products set sort_order = 2 where name = 'Brownie torta' and sub = 'Ø 16 cm';
update products set sort_order = 3 where name = 'Brownie torta' and sub = 'Ø 18 cm';
update products set sort_order = 4 where name = 'Brownie torta' and sub = 'Ø 20 cm';
update products set sort_order = 5 where name = 'Brownie torta' and sub = 'Ø 22 cm';
update products set sort_order = 6 where name = 'Pavlova torta';
