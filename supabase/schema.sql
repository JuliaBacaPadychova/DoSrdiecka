-- Do srdiečka — databázová schéma pre Supabase
-- Tento skript spusti raz v Supabase: Dashboard -> SQL Editor -> New query -> vlož celý obsah -> Run.
-- Je bezpečné ho spustiť len raz na čistom projekte (vytvára tabuľky, ktoré ešte neexistujú).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- KATEGÓRIE (Chlebík, Zákusky, Torty)
-- ---------------------------------------------------------------------
create table if not exists categories (
  id text primary key,
  name text not null,
  note text not null default '',
  sort_order int not null default 0
);

-- ---------------------------------------------------------------------
-- VÝROBKY
-- ---------------------------------------------------------------------
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  category_id text not null references categories(id),
  name text not null,
  sub text not null default '',
  description text not null default '',
  alt_text text not null default '',
  price numeric(10,2) not null,
  min_qty int not null default 1,
  min_label text not null default '',
  allergens text not null default '',
  image_url text not null default '',
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- OTVORENÉ DNI + DENNÝ LIMIT (kapacita)
-- ---------------------------------------------------------------------
create table if not exists open_days (
  day date primary key,
  is_open boolean not null default true,
  cap_zakusky int not null default 18,
  cap_torty int not null default 1,
  cap_chlebik int not null default 1
);

-- ---------------------------------------------------------------------
-- OBJEDNÁVKY
-- ---------------------------------------------------------------------
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  -- Poradové číslo pre ľudí: v e-mailoch aj v správe sa objednávka
  -- označuje ním, nie dlhým vnútorným identifikátorom.
  order_no bigserial unique,
  day date not null,
  customer_name text not null,
  phone text not null,
  email text not null,
  note text not null default '',
  status text not null default 'nova' check (status in ('nova','vybavena','zrusena')),
  total_estimate numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  category_id text not null,
  name_snapshot text not null,
  sub_snapshot text not null default '',
  price_snapshot numeric(10,2) not null,
  qty int not null
);

create index if not exists order_items_order_id_idx on order_items(order_id);
create index if not exists orders_day_idx on orders(day);

-- ---------------------------------------------------------------------
-- NASTAVENIA STRÁNKY (texty na úvode)
-- ---------------------------------------------------------------------
create table if not exists site_settings (
  id boolean primary key default true check (id),
  hero_title text not null default E'Niečo sladké bez výčitky?\nJasné! Každý kúsok ide predsa do srdiečka.',
  hero_lead text not null default 'Chlebík, zákusky aj torty z čerstvých surovín — pracujem prevažne s bezlaktózovými produktami a príchute rada prispôsobím tvojim preferenciám.',
  about_text text not null default 'Pracujem prevažne s bezlaktózovými produktami.'
);
insert into site_settings (id) values (true) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- ZABEZPEČENIE: Row Level Security zapnuté a bez povolení pre verejnosť.
-- Web nikdy nepristupuje do databázy priamo z prehliadača — vždy len cez
-- naše vlastné /api funkcie, ktoré používajú tajný "service role" kľúč
-- (ten RLS obchádza zámerne, lebo beží len na serveri, nie v prehliadači).
-- ---------------------------------------------------------------------
alter table categories enable row level security;
alter table products enable row level security;
alter table open_days enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table site_settings enable row level security;

-- ---------------------------------------------------------------------
-- POHĽAD: zvyšná kapacita na deň (počíta sa z už prijatých objednávok)
--
-- security_invoker: pohľad sa pýta tabuliek pod právami toho, kto sa
-- pýta jeho, nie pod právami autora. Bez toho by obchádzal ochranu na
-- tabuľkách a kapacity by si prečítal ktokoľvek aj s verejným kľúčom.
-- Web tým netrpí — číta ho zo servera service-role kľúčom.
-- ---------------------------------------------------------------------
create or replace view day_capacity as
select
  d.day,
  d.is_open,
  d.cap_zakusky,
  d.cap_torty,
  d.cap_zakusky - coalesce(z.used, 0) as remaining_zakusky,
  d.cap_torty - coalesce(t.used, 0) as remaining_torty,
  -- Nové stĺpce musia byť na konci: "create or replace view" v Postgrese
  -- vie stĺpce iba pridať, nie vložiť doprostred ani premenovať.
  d.cap_chlebik,
  d.cap_chlebik - coalesce(ch.used, 0) as remaining_chlebik
from open_days d
left join (
  select o.day, sum(oi.qty) as used
  from order_items oi
  join orders o on o.id = oi.order_id
  where o.status <> 'zrusena' and oi.category_id = 'zakusky'
  group by o.day
) z on z.day = d.day
left join (
  select o.day, sum(oi.qty) as used
  from order_items oi
  join orders o on o.id = oi.order_id
  where o.status <> 'zrusena' and oi.category_id = 'torty'
  group by o.day
) t on t.day = d.day
left join (
  select o.day, sum(oi.qty) as used
  from order_items oi
  join orders o on o.id = oi.order_id
  where o.status <> 'zrusena' and oi.category_id = 'chlebik'
  group by o.day
) ch on ch.day = d.day;

alter view day_capacity set (security_invoker = on);

-- ---------------------------------------------------------------------
-- FUNKCIA: atomické vytvorenie objednávky s kontrolou kapacity.
-- Zamkne riadok daného dňa (FOR UPDATE), takže aj keď dvaja zákazníci
-- odošlú objednávku v tej istej sekunde, kapacita sa neprekročí.
-- ---------------------------------------------------------------------
create or replace function create_order(
  p_day date,
  p_name text,
  p_phone text,
  p_email text,
  p_note text,
  p_items jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day open_days%rowtype;
  v_item jsonb;
  v_product products%rowtype;
  v_zak_used int := 0;
  v_tor_used int := 0;
  v_chl_used int := 0;
  v_zak_add int := 0;
  v_tor_add int := 0;
  v_chl_add int := 0;
  v_order_id uuid;
  v_order_no bigint;
  v_total numeric(10,2) := 0;
  v_qty int;
begin
  select * into v_day from open_days where day = p_day for update;
  if not found or not v_day.is_open then
    raise exception 'day_closed';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'no_items';
  end if;

  select coalesce(sum(oi.qty), 0) into v_zak_used
    from order_items oi join orders o on o.id = oi.order_id
    where o.day = p_day and o.status <> 'zrusena' and oi.category_id = 'zakusky';
  select coalesce(sum(oi.qty), 0) into v_tor_used
    from order_items oi join orders o on o.id = oi.order_id
    where o.day = p_day and o.status <> 'zrusena' and oi.category_id = 'torty';
  select coalesce(sum(oi.qty), 0) into v_chl_used
    from order_items oi join orders o on o.id = oi.order_id
    where o.day = p_day and o.status <> 'zrusena' and oi.category_id = 'chlebik';

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from products
      where id = (v_item->>'product_id')::uuid and active;
    if not found then
      raise exception 'product_not_found';
    end if;

    v_qty := (v_item->>'qty')::int;
    if v_qty is null or v_qty <= 0 or v_qty > 200 then
      raise exception 'invalid_qty';
    end if;
    if v_qty < v_product.min_qty then
      raise exception 'below_minimum';
    end if;

    if v_product.category_id = 'zakusky' then
      v_zak_add := v_zak_add + v_qty;
    elsif v_product.category_id = 'torty' then
      v_tor_add := v_tor_add + v_qty;
    elsif v_product.category_id = 'chlebik' then
      v_chl_add := v_chl_add + v_qty;
    end if;

    v_total := v_total + v_product.price * v_qty;
  end loop;

  if v_zak_used + v_zak_add > v_day.cap_zakusky then
    raise exception 'capacity_zakusky';
  end if;
  if v_tor_used + v_tor_add > v_day.cap_torty then
    raise exception 'capacity_torty';
  end if;
  if v_chl_used + v_chl_add > v_day.cap_chlebik then
    raise exception 'capacity_chlebik';
  end if;

  insert into orders (day, customer_name, phone, email, note, total_estimate)
    values (p_day, p_name, p_phone, p_email, p_note, v_total)
    returning id, order_no into v_order_id, v_order_no;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from products where id = (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'qty')::int;
    insert into order_items (order_id, product_id, category_id, name_snapshot, sub_snapshot, price_snapshot, qty)
      values (v_order_id, v_product.id, v_product.category_id, v_product.name, v_product.sub, v_product.price, v_qty);
  end loop;

  return jsonb_build_object(
    'order_id', v_order_id, 'order_no', v_order_no, 'total', v_total);
end;
$$;

-- Funkciu smie spúšťať iba náš server (service-role kľúčom). Bez tohto
-- ju cez /rest/v1/rpc/create_order zavolá ktokoľvek s verejným kľúčom
-- a obíde kontroly, ktoré robí /api/orders — a hlavne si vie zaplniť
-- dni vymyslenými objednávkami.
revoke execute on function create_order(date, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function create_order(date, text, text, text, text, jsonb)
  to service_role;

-- ---------------------------------------------------------------------
-- ÚLOŽISKO NA FOTKY VÝROBKOV (verejne čitateľné, nahrávať vie len admin
-- cez náš /api/admin/upload, ktorý používa service role kľúč)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- ZÁKLADNÉ DÁTA: kategórie a výrobky presne podľa prototypu.
-- Obrázky spočiatku ukazujú na vlastné hosťované fotky (public/assets/img),
-- v admin časti ich vieš kedykoľvek nahradiť nahratím novej fotky.
-- ---------------------------------------------------------------------
insert into categories (id, name, note, sort_order) values
  ('chlebik', 'Chlebík', 'Kváskové pečivo z pomalého kysnutia.', 1),
  ('zakusky', 'Zákusky', 'Drobné dezerty po jednom kuse · minimálny odber 6 ks.', 2),
  ('torty',   'Torty',   'Na objednávku · veľkosť aj príchute podľa dohody · na deň stíham 1 tortu.', 3)
on conflict (id) do nothing;

insert into products (category_id, name, sub, description, alt_text, price, min_qty, min_label, allergens, image_url, sort_order) values
  ('chlebik', 'Kváskový chlebík', 'Pšeničný svetlý',
   'Pomaly kysnutý pšeničný chlebík na kvásku.', '',
   3, 1, '', '1', '/assets/img/chlebik.jpg', 1),

  -- Poradie kariet drží najnižšie číslo v skupine príchutí:
  -- veterník, Choux, Mini Pavlova, Cupcake. Každý riadok musí mať
  -- vlastné číslo, inak databáza vráti príchute v náhodnom poradí.
  --
  -- Tretia možnosť pri Choux je "podľa želania": nemá vyplnené alergény,
  -- tak ich karta ani nespomenie — zloženie sa dohodne až podľa
  -- poznámky, ktorú zákazníčka musí k objednávke napísať.
  ('zakusky', 'Choux', 'Pistáciovo mangový',
   'Mango krém, pistáciový krém, jablkový vklad.',
   '',
   3, 6, 'min. 6 ks', '1, 3, 6, 7, 8', '/assets/img/choux.jpg', 3),

  ('zakusky', 'Choux', 'Pistáciovo kávový',
   'Kávový krém, pistáciový krém, malinový vklad.',
   '',
   3, 6, 'min. 6 ks', '1, 3, 6, 7, 8', '/assets/img/choux.jpg', 4),

  ('zakusky', 'Choux', 'Chcem inú kombináciu chutí',
   'Vyber si počet kusov a napíš mi predstavu do poznámky.',
   '',
   3, 6, 'min. 6 ks', '', '/assets/img/choux.jpg', 5),

  ('zakusky', 'Cupcake', 'Mrkvový s cream cheese krémom',
   'Hebké mrkvové cesto s orechami a koreninami, cream cheese krém.',
   '',
   2, 6, 'min. 6 ks', '1, 3, 7, 8', '/assets/img/cupcake.jpg', 8),

  ('zakusky', 'Cupcake', 'Čokoládový s červenou repou',
   'Skrytá červená repa, o ktorej ani nevieš, krém rôznych príchutí. Daj mi vedieť do poznámky aký krém vyskúšame.',
   '',
   2, 6, 'min. 6 ks', '1, 3, 6, 7', '/assets/img/cupcake.jpg', 9),

  ('zakusky', 'Mini Pavlova', 'Jemná klasika',
   'Vanilkový krém, lemon curd, čerstvé maliny.',
   '',
   3, 6, 'min. 6 ks', '3, 7', '/assets/img/pavlova.jpg', 6),

  ('zakusky', 'Mini Pavlova', 'Chcem inú kombináciu chutí',
   'Vyber si počet kusov a napíš mi predstavu do poznámky.',
   '',
   3, 6, 'min. 6 ks', '', '/assets/img/pavlova.jpg', 7),

  -- Veterník má dve príchute. Web spája výrobky s rovnakým názvom
  -- v tej istej kategórii do jednej karty a podnadpisy ukazuje ako
  -- príchute; minimálny odber pritom platí pri každej z nich zvlášť.
  ('zakusky', 'Veterník', 'Karamelový',
   'Karamelová poleva, vanilkový krém, karamelová šľahačka.',
   '',
   3, 6, 'min. 6 ks', '1, 3, 6, 7, 8', '/assets/img/veternik.jpg', 1),

  ('zakusky', 'Veterník', 'Pistáciovo-malinový',
   'Pistáciová poleva, pistáciový krém, malinová šľahačka.',
   '',
   3, 6, 'min. 6 ks', '1, 3, 6, 7, 8', '/assets/img/veternik.jpg', 2),

  -- Brownie torta sa objednáva v piatich veľkostiach. Sú to samostatné
  -- riadky s rovnakým názvom — web ich spojí do jednej karty a keďže
  -- ide o torty, pomenuje ich "Veľkosti". Popis aj alergény má karta
  -- spoločné a napíše ich raz; cena je pri každej veľkosti zvlášť.
  ('torty', 'Brownie torta', 'Ø 12 cm',
   'Vanilkový krém, ovocné coulis, slaný karamel, čokoládová ganache z horkej čokolády.',
   '', 40, 1, '', '1, 3, 6, 7', '/assets/img/brownie.jpg', 1),

  ('torty', 'Brownie torta', 'Ø 16 cm',
   'Vanilkový krém, ovocné coulis, slaný karamel, čokoládová ganache z horkej čokolády.',
   '', 50, 1, '', '1, 3, 6, 7', '/assets/img/brownie.jpg', 2),

  ('torty', 'Brownie torta', 'Ø 18 cm',
   'Vanilkový krém, ovocné coulis, slaný karamel, čokoládová ganache z horkej čokolády.',
   '', 60, 1, '', '1, 3, 6, 7', '/assets/img/brownie.jpg', 3),

  ('torty', 'Brownie torta', 'Ø 20 cm',
   'Vanilkový krém, ovocné coulis, slaný karamel, čokoládová ganache z horkej čokolády.',
   '', 70, 1, '', '1, 3, 6, 7', '/assets/img/brownie.jpg', 4),

  ('torty', 'Brownie torta', 'Ø 22 cm',
   'Vanilkový krém, ovocné coulis, slaný karamel, čokoládová ganache z horkej čokolády.',
   '', 80, 1, '', '1, 3, 6, 7', '/assets/img/brownie.jpg', 5),

  ('torty', 'Pavlova torta', 'Ø 20 cm',
   'Vanilkový krém, ovocné coulis.',
   'Napíš mi do poznámky predstavu aké ovocie preferuješ.',
   35, 1, '', '3, 7', '/assets/img/pavlovaT.jpg', 6)
on conflict do nothing;

-- Pár ukážkových otvorených dní, aby si po nasadení hneď videla, ako to
-- vyzerá. Kľudne ich v admin časti zmaž/priprav podľa svojho kalendára.
insert into open_days (day, is_open, cap_zakusky, cap_torty, cap_chlebik) values
  (current_date + 7,  true, 18, 1, 1),
  (current_date + 9,  true, 18, 1, 1),
  (current_date + 14, true, 18, 1, 1)
on conflict (day) do nothing;
