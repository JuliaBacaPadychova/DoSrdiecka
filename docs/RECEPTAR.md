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

## Kde sa to ovláda

V správe webu pribudli tri záložky:

- **Suroviny** — kartotéka: balenie, cena, dátum ceny a odkiaľ je. Keď sa
  zmení cena a dátum sa nevyplní, doplní sa dnešok sám.
- **Recepty** — dve časti. Hore *Čo mám miešať*: vyberie sa príchuť a
  počet kusov a vypíšu sa všetky recepty tej príchute s gramážou
  prepočítanou na ten počet (tlačidlo pošle ten istý počet do Kalkulačky).
  Dole *Úprava receptov*: zbalený zoznam, kde sa menia gramáže, poznámka,
  suroviny a priradenie k príchutiam; ukladá sa tlačidlom.

  Výťažnosť („recept je napísaný na 20 ks") sa v správe **nedá prepísať**
  zámerne. Je to vlastnosť receptu, nie objednávky, a keď bola editovateľná,
  dala sa šípkou posunúť na 20,002 a ticho tým zmeniť cenu za kus. Ak sa
  recept naozaj prerobí, mení sa cez `supabase/migracia-oprava-vytaznosti.sql`
  alebo priamo v databáze.
- **Kalkulačka** — dva režimy: *nákupný zoznam na deň* (počty sa vezmú
  z prijatých objednávok, zrušené sa nerátajú) a *ručný prepočet*
  (príchuť + počet kusov).

Výpočet je v `lib/kalkulacia.js` a je pokrytý testami (`npm test`), takže
sa dá overiť na známych číslach bez toho, aby sa musel spúšťať web.

Obsluha je celá v jednej serverless funkcii `api/admin/receptar.js`, nie
v troch. Vercel na bezplatnom pláne pustí najviac 12 funkcií na jedno
nasadenie a projekt ich má práve toľko — trinásta by nasadenie zhodila.
Stráži to test, aby sa na to neprišlo až na živom webe.

## Ktoré ceny sa oplatí sledovať

Nie všetky. Takto sa rozdelí cena jedného choux podľa surovín — a koľko
z nej ubudne alebo pribudne, keď cena tej suroviny stúpne o pätinu:

| Surovina | € na kus | pri +20 % |
|---|---:|---:|
| Mascarpone | 0,90 | +0,18 |
| Pasta pistáciová 100% | 0,66 | +0,13 |
| Čokoláda biela 28% | 0,51 | +0,10 |
| Smotana na šľahanie 33% | 0,33 | +0,07 |
| Pyré malina | 0,29 | +0,06 |
| Maslo 82% | 0,28 | +0,06 |
| Pyré mango | 0,14 | +0,03 |
| Čokoláda gold | 0,13 | +0,03 |

Zvyšných desať surovín (múka, cukry, mlieko, želatína, vajcia) robí
dohromady menej než 8 centov na kus — tie stačí prejsť raz za rok.

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
  pyré, pasty) sa nakupujú na patisserie.sk, bežné suroviny v obchode.
  Ceny zatiaľ nikto neaktualizoval: prostredie, v ktorom sa tento kód
  písal, nemá prístup na web, takže sa nedali overiť zo zdroja. Radšej
  stará cena s dátumom než vymyslená nová. Každá surovina má
  preto `price_date` a `price_source`, aby bolo vidieť, ktorá cena je
  zastaraná.

## Ďalší krok

Obrazovky v správe webu (Suroviny, Recepty, Kalkulačka) a výpočet
v `lib/`, aby sa dal otestovať cez `npm test`. Potom napojenie na
objednávky: „nákupný zoznam na 18. 10." z reálnych objednávok toho dňa.
Veterníky sa doplnia po choux.
