-- ---------------------------------------------------------------------
-- MIGRÁCIA: objednávky mimo web zaberajú miesto, limit im nebráni
-- ---------------------------------------------------------------------
-- Spusti raz v Supabase -> SQL Editor -> New query.
--
-- Opravuje, čo sa ukázalo v praxi. Doteraz platilo, že ručná objednávka
-- do zvyšnej kapacity dňa vôbec nevstupuje. Lenže potom sa stalo toto:
-- na 12.12. bola dohodnutá torta mimo webu a web na ten istý deň ďalej
-- ponúkal tortu — hoci sa za deň upečie jedna.
--
-- Od teraz platí:
--   * ručnú objednávku limit dňa pri zápise NEBLOKUJE (ostáva ako bolo:
--     zapíše sa aj do plného dňa, aj na deň, ktorý na webe otvorený nie
--     je — ten si založí ako zatvorený),
--   * ale do obsadenosti dňa sa UŽ RÁTA, rovnako ako objednávka z webu.
--     Za deň sa upečie to isté, nech si to objedná ktokoľvek.
--
-- Stĺpce mimo_webu_* ostávajú: hovoria, koľko z obsadeného miesta je
-- dohodnuté mimo web. V Dňoch a limitoch ich vidno pri dni.
--
-- Mení sa len pohľad day_capacity a funkcia create_order. Žiadne dáta
-- sa neprepisujú, nič sa nemaže. Bezpečné spustiť aj opakovane.
-- ---------------------------------------------------------------------

comment on column orders.manual is
  'Objednávka dohodnutá mimo web. Limit dňa jej pri zápise nebráni, ale miesto na ten deň zaberá ako každá iná.';

-- ---------------------------------------------------------------------
-- Pohľad: zvyšná kapacita ráta všetky objednávky, ktoré sa na ten deň
-- pečú. Stĺpce mimo_webu_* hovoria, koľko z toho je dohodnuté osobne.
-- Stĺpce sa nepridávajú ani nepremenúvajú, mení sa len to, čo počítajú.
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
  d.cap_chlebik - coalesce(ch.used, 0) as remaining_chlebik,
  -- Z obsadenej kapacity: koľko z nej je dohodnuté mimo web. Do zvyšnej
  -- kapacity sa ráta rovnako ako objednávky z webu — za deň sa upečie to
  -- isté, nech si to objedná ktokoľvek. Vypisuje sa zvlášť preto, aby
  -- majiteľka videla, prečo deň ubúda, hoci cez web nič neprišlo.
  coalesce(mz.used, 0) as mimo_webu_zakusky,
  coalesce(mt.used, 0) as mimo_webu_torty,
  coalesce(mch.used, 0) as mimo_webu_chlebik
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
) ch on ch.day = d.day
left join (
  select o.day, sum(oi.qty) as used
  from order_items oi
  join orders o on o.id = oi.order_id
  where o.status <> 'zrusena' and o.manual and oi.category_id = 'zakusky'
  group by o.day
) mz on mz.day = d.day
left join (
  select o.day, sum(oi.qty) as used
  from order_items oi
  join orders o on o.id = oi.order_id
  where o.status <> 'zrusena' and o.manual and oi.category_id = 'torty'
  group by o.day
) mt on mt.day = d.day
left join (
  select o.day, sum(oi.qty) as used
  from order_items oi
  join orders o on o.id = oi.order_id
  where o.status <> 'zrusena' and o.manual and oi.category_id = 'chlebik'
  group by o.day
) mch on mch.day = d.day;

-- ---------------------------------------------------------------------
-- Funkcia: ručná objednávka limit nekontroluje (zapíše sa aj nad neho),
-- ale obsadenosť dňa, z ktorej vychádza kontrola pre web, ju už
-- započítava.
-- ---------------------------------------------------------------------
create or replace function create_order(
  p_day date,
  p_name text,
  p_phone text,
  p_email text,
  p_note text,
  p_items jsonb,
  -- Objednávka zapísaná ručne v správe webu (dohodnutá mimo web).
  -- Obchádza lehotu na objednanie, minimálny odber, to, či je deň
  -- otvorený, aj limit dňa — majiteľka si ju dohodla osobne a sama
  -- vie, koľko toho v ten deň zvládne. Zapíše sa s manual = true: miesto
  -- na ten deň zaberá ako každá iná, len sa v správe vypisuje zvlášť.
  p_rucne boolean default false
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
  v_lead int := 0;
  v_dnes date;
  v_novy_den boolean := false;
begin
  -- Objednávať treba pár dní vopred, kvôli nákupu surovín. Počet dní je
  -- v nastaveniach webu, aby sa dal meniť bez zásahu do kódu.
  --
  -- Dnešok sa musí počítať v našom čase, nie vo svetovom: databáza beží
  -- v UTC a medzi polnocou a druhou ráno je o deň pozadu, takže by v noci
  -- prepustila termín, ktorý je už príliš blízko.
  if not p_rucne then
    select coalesce(lead_days, 0) into v_lead from site_settings where id = true;
    v_dnes := (now() at time zone 'Europe/Bratislava')::date;
    if p_day < v_dnes + v_lead then
      raise exception 'too_soon';
    end if;
  end if;

  select * into v_day from open_days where day = p_day for update;

  if not found then
    if not p_rucne then
      raise exception 'day_closed';
    end if;
    -- Ručná objednávka si deň v kalendári založí sama, ale ZAVRETÝ:
    -- majiteľka sa dohodla osobne a na webe sa taký deň ponúkať nemá.
    -- Zakladáme ho preto, aby objednávka nevisela mimo prehľadu dní
    -- a aby aj na ňom platili limity, keby pribudla ďalšia.
    insert into open_days (day, is_open) values (p_day, false)
      on conflict (day) do nothing;
    select * into v_day from open_days where day = p_day for update;
    v_novy_den := true;
  elsif not v_day.is_open and not p_rucne then
    raise exception 'day_closed';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'no_items';
  end if;

  -- Zabraté je všetko, čo sa na ten deň pečie — ručne dohodnuté
  -- objednávky rovnako ako tie z webu. Limitu sa síce nepodriaďujú
  -- (nižšie), ale miesto zaberajú: web nesmie pustiť tortu na deň,
  -- na ktorý je už jedna sľúbená osobne.
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
    if v_qty < v_product.min_qty and not p_rucne then
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

  -- Limit stráži web. Ručnú objednávku majiteľka zapisuje s vedomím,
  -- čo v ten deň stíha, takže sa jej do cesty nestavia — zapíše sa aj
  -- nad limit. Do obsadenosti sa ale ráta (vyššie), takže ďalšiu
  -- objednávku cez web už nepustí.
  if not p_rucne then
    if v_zak_used + v_zak_add > v_day.cap_zakusky then
      raise exception 'capacity_zakusky';
    end if;
    if v_tor_used + v_tor_add > v_day.cap_torty then
      raise exception 'capacity_torty';
    end if;
    if v_chl_used + v_chl_add > v_day.cap_chlebik then
      raise exception 'capacity_chlebik';
    end if;
  end if;

  insert into orders (day, customer_name, phone, email, note, total_estimate, manual)
    values (p_day, p_name, p_phone, p_email, p_note, v_total, p_rucne)
    returning id, order_no into v_order_id, v_order_no;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from products where id = (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'qty')::int;
    insert into order_items (order_id, product_id, category_id, name_snapshot, sub_snapshot, price_snapshot, qty)
      values (v_order_id, v_product.id, v_product.category_id, v_product.name, v_product.sub, v_product.price, v_qty);
  end loop;

  return jsonb_build_object(
    'order_id', v_order_id, 'order_no', v_order_no, 'total', v_total,
    -- Nech správa webu vie povedať, že deň v kalendári pribudol.
    'day_created', v_novy_den);
end;
$$;

-- Práva ostávajú ako boli: funkciu smie spúšťať iba náš server.
revoke execute on function create_order(date, text, text, text, text, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function create_order(date, text, text, text, text, jsonb, boolean)
  to service_role;

-- ---------------------------------------------------------------------
-- Kontrola: na dni s ručnou objednávkou musí byť zvyšná kapacita už
-- znížená a v mimo_webu_* musí byť vidieť, koľko z nej je spoza webu.
-- ---------------------------------------------------------------------
select day, is_open,
       cap_zakusky, remaining_zakusky, mimo_webu_zakusky,
       cap_torty, remaining_torty, mimo_webu_torty,
       cap_chlebik, remaining_chlebik, mimo_webu_chlebik
  from day_capacity
 order by day desc
 limit 20;
