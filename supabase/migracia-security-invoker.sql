-- ---------------------------------------------------------------------
-- MIGRÁCIA: pohľad day_capacity nech rešpektuje ochranu tabuliek
-- ---------------------------------------------------------------------
-- Spusti raz v Supabase -> SQL Editor -> New query.
--
-- Rieši upozornenie "Security Definer View" zo Supabase Advisor.
-- Pohľad day_capacity sa doteraz pýtal tabuliek pod právami svojho
-- autora, čím obchádzal ochranu na úrovni riadkov. Prakticky sa cez to
-- dali prečítať len dátumy a zvyšné kapacity — teda to, čo web aj tak
-- verejne ukazuje; objednávky ani kontakty zákazníčok chránené boli.
--
-- Po tejto zmene sa pohľad pýta pod právami toho, kto sa pýta jeho.
-- Web funguje ďalej, lebo naň siaha zo servera service-role kľúčom.
--
-- Bezpečné spustiť aj opakovane.
-- ---------------------------------------------------------------------

alter view day_capacity set (security_invoker = on);
