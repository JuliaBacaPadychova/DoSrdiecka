-- ---------------------------------------------------------------------
-- KYSNUTÉ: PREMENOVANIE, PRESUN POD TORTY A DVA TEASERY
--
-- Tri veci, ktoré patria k sebe:
--
-- 1. Kategória „Chlebík" sa volá „Kysnuté". Chlebík v nej ostáva, ale
--    pribudne k nemu parená knedľa a rožky — a tie už chlebík nie sú.
--
-- 2. Kategória ide na webe pod torty. Doteraz bola prvá.
--
-- 3. Domáca parená knedľa a domáce rožky pribudnú do nej ako výrobky so
--    zapnutým príznakom `teaser`: v ponuke sa ukážu ako karta s nápisom
--    „Čoskoro" hneď vedľa chlebíka, ale bez ceny a bez tlačidla.
--
-- ID kategórie ostáva `chlebik`. Nie je to nedôslednosť: podľa tohto id
-- sa počíta denný limit v `day_capacity` aj kontrola pri objednávke
-- v `create_order`. Premenovanie id by znamenalo prepísať oboje a
-- rozbiť existujúce objednávky, ktoré si ho nesú v `order_items`.
-- Zákazníčka id nikdy nevidí — vidí názov.
--
-- Prečo príznak a nie samostatná tabuľka: takto ich majiteľka spravuje
-- v záložke Ponuka ako čokoľvek iné — fotku nahrá tým istým tlačidlom,
-- názov prepíše, poradie posunie. A keď ich raz naozaj spustí, stačí
-- prepnúť „Chystá sa" na nie a doplniť cenu; fotka aj názov ostanú.
--
-- Stránka teasery vyhadzuje zo zoznamu výrobkov hneď po načítaní, takže
-- sa k nim košík, kapacita ani objednávka vôbec nedostanú.
--
-- Bezpečné spustiť aj opakovane: názov sa prepíše len z pôvodného,
-- poradie len vtedy, keď kategória ešte nie je posledná, a výrobky sa
-- nezaložia druhýkrát.
--
-- PORADIE NASADENIA: najprv kód, potom migrácia. Kým nie je nasadená
-- stránka, ktorá príznak `teaser` pozná, vyzerali by knedľa aj rožky
-- ako bežný výrobok za 0 € s tlačidlom do košíka.
-- ---------------------------------------------------------------------

alter table products add column if not exists teaser boolean not null default false;

comment on column products.teaser is
  'Chystá sa — v ponuke je vidieť ako karta s nápisom „Čoskoro", ale nedá sa objednať.';

-- 1. Premenovanie. Len z pôvodného názvu, nech vlastná úprava ostane.
update categories set name = 'Kysnuté' where id = 'chlebik' and name = 'Chlebík';

-- 2. Na koniec poradia, teda pod torty. Podmienka drží opakované
--    spustenie: po prvom behu už kategória najvyššie poradie MÁ.
update categories
   set sort_order = (select max(sort_order) + 1 from categories where id <> 'chlebik')
 where id = 'chlebik'
   and sort_order < (select max(sort_order) from categories where id <> 'chlebik');

-- 3. Dva teasery, zaradom za chlebík.
insert into products (category_id, name, sub, description, alt_text, price,
                      min_qty, min_label, allergens, image_url, active,
                      sort_order, teaser)
select 'chlebik', v.nazov, '', '', '', 0, 1, '', '', '', true,
       (select coalesce(max(sort_order), 0) from products where category_id = 'chlebik')
         + v.poradie,
       true
  from (values ('Domáca parená knedľa', 1), ('Domáce rožky', 2)) as v(nazov, poradie)
 where not exists (
   select 1 from products p where p.category_id = 'chlebik' and p.name = v.nazov);

-- Kontrola na záver: poradie kategórií a obsah tej premenovanej.
select id, name, sort_order from categories order by sort_order;

select p.name, p.teaser, p.active, p.sort_order
  from products p
 where p.category_id = 'chlebik'
 order by p.sort_order;
