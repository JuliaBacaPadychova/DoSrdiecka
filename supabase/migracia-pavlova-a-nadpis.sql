-- Do srdiečka — príchute pri Mini Pavlove + dvojriadkový nadpis na úvode
--
-- Skript je bezpečné spustiť aj viackrát.

-- 1) Možnosť na želanie, rovnako ako pri Choux: bez vyplnených alergénov,
--    lebo zloženie sa dohodne až z poznámky k objednávke. Karta ich potom
--    vôbec nespomenie.
insert into products
  (category_id, name, sub, description, alt_text, price, min_qty, min_label, allergens, image_url, sort_order)
select
  'zakusky', 'Mini Pavlova', 'Chcem inú kombináciu chutí',
  'Vyber si počet kusov a napíš mi predstavu do poznámky.',
  '', 3, 6, 'min. 6 ks', '', '/assets/img/pavlova.jpg', 7
where not exists (
  select 1 from products where name = 'Mini Pavlova' and sub = 'Chcem inú kombináciu chutí'
);

-- 2) Poznámka "Alt.: iné príchute podľa preferencií." ide preč — presne to
--    teraz hovorí druhá možnosť.
update products
  set alt_text = ''
  where name = 'Mini Pavlova' and alt_text <> '';

-- 3) Poradie v kategórii Zákusky: veterník, Choux, Mini Pavlova, Cupcake.
--    Každý riadok potrebuje vlastné číslo, inak databáza vráti príchute
--    jedného výrobku v náhodnom poradí.
update products set sort_order = 1 where name = 'Veterník'     and sub = 'Karamelový';
update products set sort_order = 2 where name = 'Veterník'     and sub = 'Pistáciovo-malinový';
update products set sort_order = 3 where name = 'Choux'        and sub = 'Pistáciovo mangový';
update products set sort_order = 4 where name = 'Choux'        and sub = 'Pistáciovo kávový';
update products set sort_order = 5 where name = 'Choux'        and sub = 'Chcem inú kombináciu chutí';
update products set sort_order = 6 where name = 'Mini Pavlova' and sub = 'Jemná klasika';
update products set sort_order = 7 where name = 'Mini Pavlova' and sub = 'Chcem inú kombináciu chutí';
update products set sort_order = 8 where name = 'Cupcake'      and sub = 'Mrkvový s cream cheese krémom';
update products set sort_order = 9 where name = 'Cupcake'      and sub = 'Čokoládový s červenou repou';

-- 4) Nový nadpis na úvode. Zalomenie riadku je súčasťou textu — web ho
--    zobrazí ako dva riadky. V správe webu je to pole viacriadkové, takže
--    sa dá kedykoľvek prepísať aj tam.
update site_settings
  set hero_title = E'Niečo sladké bez výčitky?\nJasné! Každý kúsok ide predsa do srdiečka.'
  where id = true;
