-- ---------------------------------------------------------------------
-- MIGRÁCIA: uložené recepty v záložke Recepty
-- ---------------------------------------------------------------------
-- Spusti raz v Supabase -> SQL Editor -> New query.
--
-- „Čo mám miešať" si zakaždým pýta príchuť a počet kusov nanovo. Pri
-- príchutiach, ktoré sa robia stále dokola, je to zbytočné vyklikávanie.
-- Táto tabuľka si ten výber pamätá pod menom, takže sa dá rovno otvoriť.
--
-- Ukladá sa VÝBER, nie gramáže. Keď sa recept zmení, uložený sa
-- prepočíta z novej verzie — inak by v ňom po čase ostali staré čísla
-- a piekla by sa podľa nich.
--
-- Je to niečo iné než nákupný zoznam v Kalkulačke: ten má termín, cenu
-- a môže spájať viac príchutí. Toto je skratka k jednému rozpisu.
--
-- Bezpečné spustiť aj opakovane.
-- ---------------------------------------------------------------------

create table if not exists recipe_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  -- Príchuť z ponuky. Keď sa výrobok zmaže, skratka na neho nemá kam
  -- viesť, takže odíde s ním.
  product_id uuid references products(id) on delete cascade,
  pieces int not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists recipe_presets_product_idx on recipe_presets(product_id);

-- Rovnaká ochrana ako pri ostatných tabuľkách: do databázy sa chodí len
-- cez naše /api funkcie so service-role kľúčom, nikdy z prehliadača.
alter table recipe_presets enable row level security;

select 'Uložené recepty sú pripravené.' as stav;
