-- ---------------------------------------------------------------------
-- MIGRÁCIA: objednávku smie zakladať iba server webu
-- ---------------------------------------------------------------------
-- Spusti raz v Supabase -> SQL Editor -> New query.
--
-- Rieši dve upozornenia zo Supabase Advisor o tom, že funkciu
-- create_order vie zavolať rola anon aj authenticated cez
-- /rest/v1/rpc/create_order — teda mimo webu a mimo kontrol, ktoré
-- robí /api/orders (formát e-mailu, dĺžky údajov). Databázové limity
-- by síce platili, ale dni by sa dali zaplniť vymyslenými objednávkami.
--
-- Po tejto zmene funkciu spustí len service-role kľúč, ktorým sa na ňu
-- obracia server webu. Objednávanie cez web funguje nezmenene.
--
-- Bezpečné spustiť aj opakovane.
-- ---------------------------------------------------------------------

revoke execute on function create_order(date, text, text, text, text, jsonb)
  from public, anon, authenticated;

grant execute on function create_order(date, text, text, text, text, jsonb)
  to service_role;
