-- ---------------------------------------------------------------------
-- MIGRÁCIA: denný limit na chlebík
-- ---------------------------------------------------------------------
-- Spusti raz v Supabase -> SQL Editor -> New query.
-- Pridá dennému limitu tretiu položku (chlebík, predvolene 1 ks na deň)
-- a doplní ju do výpočtu zvyšnej kapacity aj do kontroly pri objednávke.
--
-- Bezpečné spustiť aj opakovane: stĺpec sa pridá len ak chýba a pohľad
-- s funkciou sa prepíšu novým znením. Existujúce dni a objednávky
-- zostávajú nedotknuté, dni dostanú predvolený limit 1 chlebík.
-- ---------------------------------------------------------------------

alter table open_days add column if not exists cap_chlebik int not null default 1;

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
    returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from products where id = (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'qty')::int;
    insert into order_items (order_id, product_id, category_id, name_snapshot, sub_snapshot, price_snapshot, qty)
      values (v_order_id, v_product.id, v_product.category_id, v_product.name, v_product.sub, v_product.price, v_qty);
  end loop;

  return jsonb_build_object('order_id', v_order_id, 'total', v_total);
end;
$$;
