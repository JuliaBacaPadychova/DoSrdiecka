-- ---------------------------------------------------------------------
-- MIGRÁCIA: vlastná poznámka k uloženému receptu
-- ---------------------------------------------------------------------
-- Spusti raz v Supabase -> SQL Editor -> New query.
-- Až po migracia-ulozene-recepty.sql.
--
-- Poznámka patrí k ULOŽENÉMU receptu, nie k samotnému receptu v zozname
-- receptov. Je to rozdiel:
--   * poznámka pri recepte (recipes.note) platí vždy, nech ho robíš
--     v akomkoľvek počte — napríklad „variť vo väčšom hrnci",
--   * táto poznámka platí pre konkrétne miešanie, ktoré si uložila:
--     „na 20 ks robím dvojitú dávku craquelinu", „minule bolo málo polevy".
--
-- Preto je na recipe_presets a nie na recipes. Otvorí sa s uloženým
-- receptom a zobrazí sa hneď nad rozpisom, kde ju treba čítať.
--
-- Bezpečné spustiť aj opakovane.
-- ---------------------------------------------------------------------

alter table recipe_presets add column if not exists note text not null default '';

comment on column recipe_presets.note is
  'Vlastná poznámka k tomuto uloženému receptu. Zobrazuje sa nad rozpisom.';

select name as ulozeny_recept,
       pieces as kusov,
       case when note = '' then '— zatiaľ prázdna —' else note end as poznamka
  from recipe_presets
 order by name;
