-- ---------------------------------------------------------------------
-- MIGRÁCIA: objednávky mimo web neovplyvňujú limit na webe
-- ---------------------------------------------------------------------
-- Spusti raz v Supabase -> SQL Editor -> New query.
--
-- Doteraz ručne zapísaná objednávka zaberala kapacitu dňa rovnako ako
-- objednávka z webu. Lenže limit na webe hovorí, koľko si majiteľka
-- necháva na verejné objednávanie — nie koľko celkovo upečie. Keď sa
-- s niekým dohodne osobne, rozhodla o tom sama a web jej do toho
-- nemá hovoriť.
--
-- Od teraz:
--   * ručná objednávka sa uloží s manual = true,
--   * limit dňa sa pri nej nekontroluje (dá sa zapísať aj do plného dňa),
--   * zo zvyšnej kapacity na webe neuberá.
--
-- POZOR, čo to znamená: web bude naďalej ponúkať plný počet, aj keď máš
-- polovicu dňa sľúbenú osobne. Súčet je na tebe — preto sa ručné kusy
-- vypisujú v Dňoch a limitoch zvlášť, aby boli vidieť.
--
-- Staré objednávky sa nedajú spätne rozoznať: ktorá bola z webu a ktorá
-- dohodnutá osobne, v databáze zapísané nebolo. Všetky teda ostávajú ako
-- webové (manual = false) a kapacitu naďalej zaberajú. Ak niektorú chceš
-- presunúť medzi ručné, daj vedieť — je to jeden riadok.
--
-- Bezpečné spustiť aj opakovane.
-- ---------------------------------------------------------------------

alter table orders add column if not exists manual boolean not null default false;

comment on column orders.manual is
  'Objednávka dohodnutá mimo web. Do limitu dňa na webe sa neráta.';

create index if not exists orders_manual_idx on orders(day) where manual;

-- ---------------------------------------------------------------------
-- Pohľad: zvyšná kapacita počíta len webové objednávky, ručné sa
-- vypisujú zvlášť v troch nových stĺpcoch na konci.
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
  -- Objednávky dohodnuté mimo web. Do zvyšnej kapacity nevstupujú, ale
  -- majiteľka ich musí vidieť — inak jej web ponúka 18 zákuskov, hoci
  -- desať už má sľúbených osobne.
  coalesce(mz.used, 0) as mimo_webu_zakusky,
  coalesce(mt.used, 0) as mimo_webu_torty,
  coalesce(mch.used, 0) as mimo_webu_chlebik
from open_days d
left join (
  select o.day, sum(oi.qty) as used
  from order_items oi
  join orders o on o.id = oi.order_id
  where o.status <> 'zrusena' and not o.manual and oi.category_id = 'zakusky'
  group by o.day
) z on z.day = d.day
left join (
  select o.day, sum(oi.qty) as used
  from order_items oi
  join orders o on o.id = oi.order_id
  where o.status <> 'zrusena' and not o.manual and oi.category_id = 'torty'
  group by o.day
) t on t.day = d.day
left join (
  select o.day, sum(oi.qty) as used
  from order_items oi
  join orders o on o.id = oi.order_id
  where o.status <> 'zrusena' and not o.manual and oi.category_id = 'chlebik'
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

alter view day_capacity set (security_invoker = on);

-- ---------------------------------------------------------------------
-- Funkcia: ručná objednávka limit nekontroluje a zapíše sa ako manual.
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
  -- vie, koľko toho v ten deň zvládne. Zapíše sa s manual = true, takže
  -- z limitu na webe ani neuberá; v správe sa vypisuje zvlášť.
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

  -- Zabraté je len to, čo prišlo cez web. Ručne dohodnuté objednávky
  -- limit nezmenšujú.
  select coalesce(sum(oi.qty), 0) into v_zak_used
    from order_items oi join orders o on o.id = oi.order_id
    where o.day = p_day and o.status <> 'zrusena' and not o.manual and oi.category_id = 'zakusky';
  select coalesce(sum(oi.qty), 0) into v_tor_used
    from order_items oi join orders o on o.id = oi.order_id
    where o.day = p_day and o.status <> 'zrusena' and not o.manual and oi.category_id = 'torty';
  select coalesce(sum(oi.qty), 0) into v_chl_used
    from order_items oi join orders o on o.id = oi.order_id
    where o.day = p_day and o.status <> 'zrusena' and not o.manual and oi.category_id = 'chlebik';

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
  -- čo v ten deň stíha, takže sa jej do cesty nestavia.
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

-- ---------------------------------------------------------------------
-- Kontrola: čo je na najbližších dňoch zabraté webom a čo dohodnuté mimo.
-- ---------------------------------------------------------------------
select day, is_open,
       cap_zakusky, remaining_zakusky, mimo_webu_zakusky,
       cap_torty, remaining_torty, mimo_webu_torty
  from day_capacity
 order by day desc
 limit 20;
