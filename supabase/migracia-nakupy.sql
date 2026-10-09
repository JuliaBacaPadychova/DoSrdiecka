-- ---------------------------------------------------------------------
-- MIGRÁCIA: nákup je samostatný záznam, nie údaj na nákupnom zozname
-- ---------------------------------------------------------------------
-- Spusti raz v Supabase -> SQL Editor -> New query.
--
-- Karta Peniaze doteraz brala „koľko stojí nákup" z uložených nákupných
-- zoznamov. Lenže zoznam je PRACOVNÝ dokument — plán, čo kúpiť — a má sa
-- pokojne mazať, keď je po pečení. Koľko peňazí naozaj odišlo je FAKT
-- a ten sa mazať nemá. Zavesiť fakt na životnosť plánu bola chyba návrhu.
--
-- Nákup je preto samostatný riadok: dátum a suma. Zoznam sa môže zmazať,
-- číslo ostane. A zapísať sa dá aj nákup, na ktorý žiadny zoznam nebol.
--
-- Dva stĺpce so sumou, lebo sú to dve rôzne čísla:
--   * amount      — čo naozaj odišlo z peňaženky (celé balenia, bloček),
--   * consumption — z toho sa reálne minie, zvyšok ostáva ako zásoba.
--                   Pistáciová pasta stojí 24 € za balenie, ale minie sa
--                   jej 67 g. Prvé číslo je výdavok, druhé je náklad
--                   objednávky. Zamrazí sa pri zápise, lebo spätne by sa
--                   počítalo dnešnými cenami a marcový nákup by sa menil.
--                   Pri ručne zapísanom nákupe ostane prázdne — z bločku
--                   sa prečítať nedá.
--
-- Bezpečné spustiť aj opakovane.
-- ---------------------------------------------------------------------

create table if not exists purchases (
  id uuid primary key default gen_random_uuid(),
  -- Kedy sa nakupovalo. Podľa neho nákup spadne do obdobia v Peniazoch.
  day date not null,
  amount numeric(10,2) not null default 0,
  -- Prázdne = nevie sa. Nie nula: nula by znamenala, že sa neminulo nič.
  consumption numeric(10,2),
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists purchases_day_idx on purchases(day desc);

comment on table purchases is
  'Skutočné nákupy surovín. Nezávislé od nákupných zoznamov, ktoré sú pracovné a mažú sa.';
comment on column purchases.amount is
  'Koľko naozaj odišlo — celé balenia, suma z bločku.';
comment on column purchases.consumption is
  'Z toho sa reálne minie; zvyšok ostáva ako zásoba. Prázdne = nevie sa.';

-- Rovnaká ochrana ako pri ostatných tabuľkách: do databázy sa chodí len
-- cez naše /api funkcie so service-role kľúčom, nikdy z prehliadača.
alter table purchases enable row level security;

select count(*) as nakupov, coalesce(sum(amount), 0) as spolu from purchases;
