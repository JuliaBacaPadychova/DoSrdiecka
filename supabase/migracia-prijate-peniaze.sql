-- ---------------------------------------------------------------------
-- MIGRÁCIA: prijaté peniaze za objednávku
-- ---------------------------------------------------------------------
-- Spusti raz v Supabase -> SQL Editor -> New query.
--
-- Doteraz bolo pri objednávke len to, za koľko JE — súčet cien z ponuky.
-- Koľko za ňu naozaj prišlo, nebolo kde zapísať. Pritom to nie je to isté:
--   * pri torte je cena „od 40 €", skutočná sa dohaduje,
--   * zákazníčka občas nechá euro navyše,
--   * objednávka môže byť vybavená a ešte nezaplatená.
--
-- Preto je prijatá suma samostatný stĺpec, nie oprava total_estimate.
-- Rozdiel medzi nimi je informácia, nie chyba, a má ostať vidieť.
--
-- paid_amount je zámerne BEZ default 0: prázdne znamená „ešte nezaplatené",
-- nula znamená „nedostala som nič". Keby bola nula predvolená, každá nová
-- objednávka by vyzerala ako zadarmo rozdaná.
--
-- Bezpečné spustiť aj opakovane.
-- ---------------------------------------------------------------------

alter table orders add column if not exists paid_amount numeric(10,2);
alter table orders add column if not exists paid_on date;
alter table orders add column if not exists paid_note text not null default '';

comment on column orders.paid_amount is
  'Koľko za objednávku naozaj prišlo. Prázdne = ešte nezaplatené.';
comment on column orders.paid_on is
  'Kedy platba prišla. Dopĺňa sa dnešok pri prvom zápise sumy.';

create index if not exists orders_paid_on_idx on orders(paid_on);

select count(*) as objednavok,
       count(paid_amount) as zaplatenych,
       coalesce(sum(paid_amount), 0) as prijate_spolu
  from orders
 where status <> 'zrusena';
