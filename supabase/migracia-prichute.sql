-- Do srdiečka — príchute pri jednom výrobku
--
-- Web po tejto zmene spája výrobky s rovnakým názvom v tej istej
-- kategórii do JEDNEJ karty a ich podnadpisy ukazuje ako príchute.
-- Preto stačí pridať ďalší "Veterník" s iným podnadpisom — nič v
-- databáze sa neprestavuje a žiadny stĺpec nepribúda.
--
-- Minimálny odber platí pri každej príchuti zvlášť: 3 karamelové
-- a 3 pistáciovo-malinové web neprijme, lebo ani jedna z nich
-- nedosiahne svojich 6 kusov. O to sa stará min_qty a kontrola
-- 'below_minimum' vo funkcii create_order — tá tu ostáva nezmenená.
--
-- Skript je bezpečné spustiť aj viackrát.

-- 1) Nová príchuť veterníka. Fotka aj cena zatiaľ rovnaké ako pri
--    karamelovom; v admin časti sa to dá kedykoľvek zmeniť.
insert into products
  (category_id, name, sub, description, alt_text, price, min_qty, min_label, allergens, image_url, sort_order)
select
  'zakusky', 'Veterník', 'Pistáciovo-malinový',
  'Pistáciová poleva, pistáciový krém, malinová šľahačka.',
  '', 3, 6, 'min. 6 ks', '1, 3, 6, 7, 8', '/assets/img/veternik.jpg', 5
where not exists (
  select 1 from products where name = 'Veterník' and sub = 'Pistáciovo-malinový'
);

-- 2) Pistácia – malina bola doteraz len poznámkou "Alt.:". Teraz je to
--    plnohodnotná príchuť, tak ju z poznámky vyberieme, nech tam nie je
--    dvakrát.
update products
  set alt_text = 'Alt.: čokoláda – vanilka, alebo iné príchute podľa preferencií.'
  where name = 'Veterník'
    and sub = 'Karamelový'
    and alt_text = 'Alt.: pistácia – malina, alebo čokoláda – vanilka.';
