-- ---------------------------------------------------------------------
-- HUSTOTA SMOTANY: 1 ml = 0,98 g
--
-- Recepty z kurzových kariet sú písané v gramoch, ale smotana sa kupuje
-- v mililitroch — balenie (pack_size) je v ml a z neho sa počíta cena.
-- Bez prevodu smotana do ceny nevstúpi vôbec a v kalkulácii sa vypíše
-- medzi nedopočítanými. Odvážená hodnota je 0,98 g na mililiter.
--
-- Nastavuje sa všetkým šľahačkovým smotanám naraz (33 %, 35 %, 40 %).
-- Hustota sa s tučnosťou mení len nepatrne — tuk je redší než voda,
-- takže 40 % je o niečo málo redšia než 33 % — rozdiel je pod 1 %,
-- čo je menej, než kolísanie ceny medzi nákupmi.
--
-- POZOR, PREPISUJE: keby pri niektorej smotane už bola iná hodnota,
-- táto migrácia ju nahradí. Je to zámer — 0,98 je odvážené číslo.
--
-- Bezpečné spustiť aj opakovane. Mení hodnotu v existujúcom stĺpci,
-- takže môže bežať aj pred nasadením; žiadna zmena kódu k nej nepatrí.
-- ---------------------------------------------------------------------

update ingredients
   set grams_per_ml = 0.98
 where name like 'Smotana na šľahanie%'
   and unit = 'ml'
   and grams_per_ml is distinct from 0.98;

-- Kontrola: všetky smotany musia mať vyplnený prevod.
select name, unit, pack_size, grams_per_ml
  from ingredients
 where name like 'Smotana%'
 order by name;
