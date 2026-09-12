-- ---------------------------------------------------------------------
-- MIGRÁCIA: uložené nákupné zoznamy
-- ---------------------------------------------------------------------
-- Spusti raz v Supabase -> SQL Editor -> New query.
--
-- Nákupný zoznam doteraz vznikal len z prijatých objednávok na daný deň.
-- Lenže suroviny treba nakúpiť vopred — v čase, keď objednávky ešte
-- nie sú — a na jeden deň sa môže piecť viac príchutí naraz. Preto je
-- zoznam samostatná vec: má svoj termín, názov a súpis "príchuť + počet
-- kusov", ktorý si majiteľka zostaví sama. Z objednávok sa dá vychádzať,
-- ale zoznam nimi nie je obmedzený.
--
-- Položky sú v jednom jsonb stĺpci zámerne: zoznam sa vždy upravuje a
-- ukladá ako celok a nikdy sa nehľadá "vo všetkých zoznamoch, kde je
-- pistáciový choux". Samostatná tabuľka položiek by pridala prácu a nič
-- by nepriniesla.
--
-- Bezpečné spustiť aj opakovane.
-- ---------------------------------------------------------------------

create table if not exists shopping_plans (
  id uuid primary key default gen_random_uuid(),
  -- Na kedy sa pečie. Môže byť prázdny, kým nie je termín dohodnutý.
  day date,
  name text not null default '',
  note text not null default '',
  -- [{ "product_id": "...", "kusy": 12 }, ...]
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists shopping_plans_day_idx on shopping_plans(day desc);

-- Rovnaká ochrana ako pri ostatných tabuľkách: do databázy sa chodí len
-- cez naše /api funkcie so service-role kľúčom, nikdy z prehliadača.
alter table shopping_plans enable row level security;

select 'Tabuľka nákupných zoznamov je pripravená.' as stav;
