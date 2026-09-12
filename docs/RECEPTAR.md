# Receptár a kalkulácia — ako je to poskladané

Nahrádza excely `Choux_varianty.xlsx` a `Odpalovane_cesto.xlsx`. Dáta sú
v databáze (Supabase), nie v hárkoch, aby sa dal nákupný zoznam sčítať
cez **viac príchutí naraz** a aby bol každý recept zapísaný raz.

Spustenie: `supabase/migracia-receptar.sql` raz v Supabase → SQL Editor.
Skript je bezpečné spustiť aj opakovane — nič, čo si medzitým v správe
webu upravila, neprepíše.

## Štyri tabuľky

| Tabuľka | Čo v nej je | Bývalý hárok |
|---|---|---|
| `ingredients` | suroviny, balenie, cena, alergény | Ciselnik |
| `recipes` | recept: druh, výťažnosť, postup | Všetko / Odpalované cesto |
| `recipe_items` | čo a koľko ide do receptu | stĺpce B a C |
| `product_recipes` | ktoré recepty tvoria príchuť na webe | (v exceli nebolo) |

`product_recipes` je to, čo excel nemal: príchuť ako *Choux / Pistáciovo
kávový* je už dnes riadok v tabuľke `products`. Keď sa k nej priviažu
recepty, nákupný zoznam sa dá zobrať priamo z objednávok na daný deň.

## Ako sa počíta

1. **Prepočet na počet kusov** — `množstvo × kusy / výťažnosť`.
   Výťažnosť je to číslo, ktoré bolo v exceli nad receptom („10KS").
2. **Jedno cesto, rôzne tvary** — odpalované cesto je napísané na 20 choux
   a to isté cesto vydá 12 veterníkov. Nie sú to dva recepty; rozdiel je
   v `qty_per_piece` pri príchuti.
3. **Dve ceny, nie jedna:**
   - *spotreba* = `gramy × cena balenia / gramáž balenia` — čo naozaj
     minieš. Toto je číslo na cenotvorbu.
   - *nákup* = `zaokrúhli nahor(potreba / balenie) × cena balenia` — čo
     zaplatíš v obchode. Toto je číslo na nákupný zoznam.

   Rozdiel nie je malý. Pistáciový krém na 14 ks: nákup 39,94 € (2,85 €/ks),
   spotreba 10,92 € (0,78 €/ks). Pistáciová pasta stojí 24 € za balenie,
   ale minie sa jej 67 g — zvyšok nie je náklad tejto objednávky.
   Excel ukazoval len nákupnú cenu, takže cena za kus vychádzala vyššia,
   než v skutočnosti je.
4. **Nič nemizne potichu.** Keď surovina nemá vyplnené balenie (soľ, sóda,
   obal) alebo riadok nemá gramáž („štipka soli"), v kalkulácii sa vypíše
   ako *doplň balenie* / *bez gramáže*. V exceli ho `IFERROR` zahodil a
   cena vyšla nižšia, než bola.
5. **Voda** má `negligible = true` — do ceny sa vedome neráta.

## Jednotky

Každá surovina má vlastnú jednotku (`g` / `ml` / `ks`). V exceli mal
stĺpec názov „v gramoch", ale pri želatíne v ňom boli plátky — preto
`Želatína plátková` je v kusoch (1 plátok Silver 180 bloom = 5 g).

## Zloženie príchutí

| Príchuť | Navrch | Dovnútra | Základ |
|---|---|---|---|
| Choux / Pistáciovo mangový | mangová šľahaná ganache | pistáciový krém + jablkové confit | cesto + craquelin svetlý |
| Choux / Pistáciovo kávový | kávová ganache | pistáciový krém + malinové coulis | cesto + craquelin svetlý |

Navrch ide **ganache, nie varený mangový krém**: má 27 % tuku proti 18 %,
o 12 bodov menej vody a 5 % kakaového masla, ktoré drží tvar do ~30 °C.
Želatína vo varenom kréme sa pri izbovej teplote začína topiť, takže krém
je síce v chladničke pevnejší, ale na stole zmäkne skôr.

Množstvo malinového coulis na kus (12 g) je **odhad** — upraviť po prvej
skúške.

## Čo z toho vyšlo

Náklad na suroviny na jeden kus, pri predajnej cene 3 €:

| Príchuť | Suroviny na kus | Zostane z 3 € |
|---|---|---|
| Pistáciovo mangový | 1,62 € | 1,38 € |
| Pistáciovo kávový | 2,03 € | 0,97 € |

A to ešte bez obalu, réžie, práce a bez surovín, ktoré nemajú vyplnené
balenie (pektín, agar, citrónová šťava, jablkové pyré, soľ). Skutočné
číslo bude vyššie.

Najdrahšie časti kávového choux: pistáciový krém 0,78 €/ks a kávová
ganache 0,74 €/ks. Keby kávová ganache naozaj vyšla na 20 ks namiesto 12
(poznámka v exceli), klesla by na 0,44 €/ks — preto sa to oplatí overiť.

## Čo ešte treba doplniť

Tieto veci sa dopĺňajú v správe webu, nie v kóde:

- **Obal** — `Krabička na zákusky` je založená bez ceny; kupuje sa podľa
  dostupnosti, cena sa vpíše po nákupe.
- **Balenie soli, sódy a vanilky** — ceny z excelu tam sú, gramáž balenia
  chýba, takže sa zatiaľ do ceny nerátajú a sú označené.
- **Pektín NH, agar, citrónová šťava, pyré jablko, pyré višňa** — recepty
  ich používajú, v číselníku neboli vôbec. Založené bez ceny.
- **Réžia** — zatiaľ nie je; keď bude známa, pridá sa ako položka druhu
  `rezia` počítaná na kus.

## Otvorené otázky k receptom

- **Craquelin**: v texte receptu je 85 g múky, v prepočtovom stĺpci 170 g
  (dvojitá dávka — „vždy mi chýbali kolieska"). Zapísaná je dvojitá dávka
  s výťažnosťou 20 ks; treba overiť, či dvojitá dávka naozaj pokryje
  20 choux.
- **Jablkové confit**: v texte 35 g cukru, v stĺpci 40 g. Zapísané 40 g.
- **Kávová ganache**: poznámka v exceli hovorí, že dávka by vyšla aj na
  20 ks namiesto 12. Zapísaných je 12 — kým sa to neoverí, cena za kus
  by bola podhodnotená.
- **Ceny** sú z excelu a sú približne pol roka staré. Špeciality (čokolády,
  pyré, pasty) sa nakupujú na patisserie.sk, bežné suroviny v obchode. Každá surovina má
  preto `price_date` a `price_source`, aby bolo vidieť, ktorá cena je
  zastaraná.

## Ďalší krok

Obrazovky v správe webu (Suroviny, Recepty, Kalkulačka) a výpočet
v `lib/`, aby sa dal otestovať cez `npm test`. Potom napojenie na
objednávky: „nákupný zoznam na 18. 10." z reálnych objednávok toho dňa.
Veterníky sa doplnia po choux.
