-- Do srdiečka — príchute pri Choux (vrátane možnosti na želanie)
--
-- Rovnaký princíp ako pri veterníku: výrobky s rovnakým názvom v tej
-- istej kategórii sa na webe spoja do jednej karty a ich podnadpisy sa
-- ukážu ako príchute. Nič sa v databáze neprestavuje.
--
-- Tretia možnosť "Chcem inú kombináciu chutí" je obyčajná príchuť s
-- prázdnymi alergénmi — karta pri nej alergény vôbec nenapíše, lebo
-- kombinácia sa dohodne až podľa poznámky v objednávke. Cena aj
-- minimálny odber ostávajú rovnaké ako pri ostatných príchutiach.
--
-- Skript je bezpečné spustiť aj viackrát.

-- 1) Nové príchute. Fotka je zatiaľ spoločná s existujúcim Choux;
--    v admin časti sa dá pri každej príchuti kedykoľvek zmeniť.
insert into products
  (category_id, name, sub, description, alt_text, price, min_qty, min_label, allergens, image_url, sort_order)
select
  'zakusky', 'Choux', 'Pistáciovo kávový',
  'Kávový krém, pistáciový krém, malinový vklad.',
  '', 3, 6, 'min. 6 ks', '1, 3, 6, 7, 8', '/assets/img/choux.jpg', 2
where not exists (
  select 1 from products where name = 'Choux' and sub = 'Pistáciovo kávový'
);

insert into products
  (category_id, name, sub, description, alt_text, price, min_qty, min_label, allergens, image_url, sort_order)
select
  'zakusky', 'Choux', 'Chcem inú kombináciu chutí',
  'Vyber si počet kusov a napíš mi predstavu do poznámky.',
  '', 3, 6, 'min. 6 ks', '', '/assets/img/choux.jpg', 3
where not exists (
  select 1 from products where name = 'Choux' and sub = 'Chcem inú kombináciu chutí'
);

-- 2) Poznámka "Alt.: slaný karamel – vanilka, alebo iné príchute podľa
--    preferencií." ide preč — presne to teraz hovorí tretia možnosť.
update products
  set alt_text = ''
  where name = 'Choux' and alt_text <> '';

-- 3) Poradie v kategórii Zákusky. Každý riadok musí mať vlastné číslo,
--    inak by databáza vrátila príchute jedného výrobku v náhodnom
--    poradí a "základná" by nemusela byť prvá.
update products set sort_order = 1 where name = 'Choux'       and sub = 'Pistáciovo mangový';
update products set sort_order = 2 where name = 'Choux'       and sub = 'Pistáciovo kávový';
update products set sort_order = 3 where name = 'Choux'       and sub = 'Chcem inú kombináciu chutí';
update products set sort_order = 4 where name = 'Cupcake';
update products set sort_order = 5 where name = 'Mini Pavlova';
update products set sort_order = 6 where name = 'Veterník'    and sub = 'Karamelový';
update products set sort_order = 7 where name = 'Veterník'    and sub = 'Pistáciovo-malinový';
