-- ---------------------------------------------------------------------
-- TEASER: „ČOSKORO" PRI CHLEBÍKU
--
-- Domáca parená knedľa a domáce rožky sa zatiaľ nedajú objednať, ale
-- majú byť na webe vidieť. Sú to bežné výrobky so zapnutým príznakom
-- `teaser`: v ponuke sa ukážu ako karta s obrázkom a nápisom „Čoskoro",
-- ale bez ceny a bez tlačidla do košíka.
--
-- Prečo príznak a nie samostatná tabuľka: takto ich majiteľka spravuje
-- v záložke Ponuka ako čokoľvek iné — fotku nahrá tým istým tlačidlom,
-- názov prepíše, poradie posunie. A keď ich raz naozaj spustí, stačí
-- prepnúť „Chystá sa" na nie, doplniť cenu a presunúť do kategórie;
-- fotka aj text ostanú.
--
-- Stránka teasery vyhadzuje zo zoznamu výrobkov hneď po načítaní, takže
-- sa k nim košík, kapacita ani objednávka vôbec nedostanú. Nie je to
-- zakázané tlačidlo — v tej časti kódu neexistujú.
--
-- Cena je 0 a na stránke sa pri teaseri nevypisuje. Stĺpec je
-- `not null`, takže prázdna byť nemôže.
--
-- Bezpečné spustiť aj opakovane: kategória ani výrobky sa nezaložia
-- druhýkrát a nič sa neprepíše.
--
-- PORADIE NASADENIA: najprv kód, potom migrácia. Kým nie je nasadená
-- stránka, ktorá príznak `teaser` pozná, vyzerali by knedľa aj rožky
-- ako bežný výrobok za 0 € s tlačidlom do košíka.
-- ---------------------------------------------------------------------

alter table products add column if not exists teaser boolean not null default false;

comment on column products.teaser is
  'Chystá sa — v ponuke je vidieť ako karta s nápisom „Čoskoro", ale nedá sa objednať.';

-- Kategória hneď za chlebíkom. sort_order sa počíta z chlebíka, nie
-- napevno — keby si poradie kategórií medzitým premiešala, teaser
-- ostane tam, kam patrí.
insert into categories (id, name, note, sort_order)
select 'coskoro', 'Čoskoro', 'Na týchto sa ešte pracuje — objednať sa zatiaľ nedajú.',
       coalesce((select sort_order from categories where id = 'chlebik'), 0) + 1
 where not exists (select 1 from categories where id = 'coskoro');

insert into products (category_id, name, sub, description, alt_text, price,
                      min_qty, min_label, allergens, image_url, active,
                      sort_order, teaser)
select 'coskoro', v.nazov, '', '', '', 0, 1, '', '', '', true, v.poradie, true
  from (values ('Domáca parená knedľa', 1), ('Domáce rožky', 2)) as v(nazov, poradie)
 where not exists (
   select 1 from products p where p.category_id = 'coskoro' and p.name = v.nazov);

-- Kontrola na záver.
select p.name, c.name as kategoria, p.teaser, p.active, p.sort_order
  from products p join categories c on c.id = p.category_id
 where p.category_id = 'coskoro'
 order by p.sort_order;
