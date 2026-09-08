-- Do srdiečka — objednávanie niekoľko dní vopred
--
-- Pridáva nastavenie "koľko dní vopred sa musí objednať" a zabudováva ho
-- do funkcie, ktorá objednávku zakladá. Kontrola je zámerne tu, nielen
-- v kalendári: kalendár je len to, čo vidno v prehliadači, a dá sa obísť.
--
-- Dnešok sa počíta v našom čase (Europe/Bratislava), nie vo svetovom.
-- Databáza beží v UTC a medzi polnocou a druhou ráno je o deň pozadu —
-- v noci by teda prepustila termín, ktorý je už príliš blízko. Tá istá
-- podmienka zároveň zamedzí objednávke na deň v minulosti, čo doteraz
-- server nekontroloval vôbec.
--
-- Skript je bezpečné spustiť aj viackrát.

-- 1) Nastavenie. Predvolené sú 4 dni; meniť sa dá v Správa → Nastavenia.
alter table site_settings
  add column if not exists lead_days int not null default 4;

do $migracia$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'site_settings_lead_days_check'
  ) then
    alter table site_settings
      add constraint site_settings_lead_days_check check (lead_days between 0 and 60);
  end if;
end
$migracia$;

-- 2) Funkcia s kontrolou. Je to celé znenie funkcie, nie záplata —
--    "create or replace" telo prepíše a práva na nej ostávajú.
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
  v_lead int := 0;
  v_dnes date;
begin
  -- Objednávať treba pár dní vopred, kvôli nákupu surovín. Počet dní je
  -- v nastaveniach webu, aby sa dal meniť bez zásahu do kódu.
  --
  -- Dnešok sa musí počítať v našom čase, nie vo svetovom: databáza beží
  -- v UTC a medzi polnocou a druhou ráno je o deň pozadu, takže by v noci
  -- prepustila termín, ktorý je už príliš blízko.
  select coalesce(lead_days, 0) into v_lead from site_settings where id = true;
  v_dnes := (now() at time zone 'Europe/Bratislava')::date;
  if p_day < v_dnes + v_lead then
    raise exception 'too_soon';
  end if;

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

-- 3) Práva pre istotu znova: funkciu smie spúšťať iba náš server.
revoke execute on function create_order(date, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function create_order(date, text, text, text, text, jsonb)
  to service_role;
