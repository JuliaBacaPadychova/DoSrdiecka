-- Do srdiečka — príchute pri Cupcake + nové poradie zákuskov
--
-- Cupcake dostáva dve príchute rovnakým spôsobom ako veterník a Choux:
-- výrobky s rovnakým názvom v tej istej kategórii sa na webe spoja do
-- jednej karty a ich podnadpisy sa ukážu ako príchute.
--
-- Skript je bezpečné spustiť aj viackrát.

-- 1) Upresnený popis a alergény pri mrkvovom.
update products
  set description = 'Hebké mrkvové cesto s orechami a koreninami, cream cheese krém.',
      allergens = '1, 3, 7, 8'
  where name = 'Cupcake' and sub = 'Mrkvový s cream cheese krémom';

-- 2) Nová príchuť. Fotka je zatiaľ spoločná s mrkvovým; v admin časti sa
--    dá pri každej príchuti kedykoľvek zmeniť.
insert into products
  (category_id, name, sub, description, alt_text, price, min_qty, min_label, allergens, image_url, sort_order)
select
  'zakusky', 'Cupcake', 'Čokoládový s červenou repou',
  'Skrytá červená repa, o ktorej ani nevieš, krém rôznych príchutí. Daj mi vedieť do poznámky aký krém vyskúšame.',
  '', 2, 6, 'min. 6 ks', '1, 3, 6, 7', '/assets/img/cupcake.jpg', 8
where not exists (
  select 1 from products where name = 'Cupcake' and sub = 'Čokoládový s červenou repou'
);

-- 3) Poznámka "Alt.: čokoládový s červenou repou, krémy iných príchutí."
--    ide preč — je z nej plnohodnotná príchuť.
update products
  set alt_text = ''
  where name = 'Cupcake' and alt_text <> '';

-- 4) Nové poradie v kategórii Zákusky: veterník, Choux, Mini Pavlova,
--    Cupcake. Každý riadok potrebuje vlastné číslo, inak databáza vráti
--    príchute jedného výrobku v náhodnom poradí. Kartu drží na mieste
--    najnižšie číslo v skupine.
update products set sort_order = 1 where name = 'Veterník'     and sub = 'Karamelový';
update products set sort_order = 2 where name = 'Veterník'     and sub = 'Pistáciovo-malinový';
update products set sort_order = 3 where name = 'Choux'        and sub = 'Pistáciovo mangový';
update products set sort_order = 4 where name = 'Choux'        and sub = 'Pistáciovo kávový';
update products set sort_order = 5 where name = 'Choux'        and sub = 'Chcem inú kombináciu chutí';
update products set sort_order = 6 where name = 'Mini Pavlova';
update products set sort_order = 7 where name = 'Cupcake'      and sub = 'Mrkvový s cream cheese krémom';
update products set sort_order = 8 where name = 'Cupcake'      and sub = 'Čokoládový s červenou repou';
