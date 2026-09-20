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
| `recipes` | recept: výťažnosť, postup, poznámka | Všetko / Odpalované cesto |
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

## Z jednej dávky vyjde pri každej príchuti iný počet

Z dávky odpalovaného cesta vyjde 20 choux, ale len 12 veterníkov — sú
väčšie. Preto má väzba receptu na príchuť stĺpec `pieces_per_batch`:
koľko kusov *tejto* príchute vyjde z jednej dávky. Prázdny = platí
výťažnosť receptu, čo je bežný prípad (krémy sú písané priamo na
10 veterníkov).

Bez toho by sa na veterníky napočítalo cesta o 40 % menej, než treba.

## Zloženie príchutí

| Príchuť | Navrch | Dovnútra | Základ |
|---|---|---|---|
| Choux / Pistáciovo mangový | mangová šľahaná ganache | pistáciový krém + jablkové confit | cesto + craquelin svetlý |
| Choux / Pistáciovo kávový | kávová ganache | pistáciový krém + malinové coulis | cesto + craquelin svetlý |
| Veterník / Karamelový | karamelová poleva | vanilkový krém Suzys + karamelová šľahačka | cesto (z dávky 12 ks) + slaný a sladký karamel |
| Veterník / Pistáciovo-malinový | pistáciová poleva | pistáciový krém — veterník + malinová šľahačka | cesto (z dávky 12 ks) |

Karamel je **samostatný recept**, nie kúpená surovina: z jednej dávky
vyjde slaný karamel na polevu (240 g) aj sladký na šľahačku (250 g).
V exceli sa počítal dvakrát — raz ako suroviny na jeho uvarenie, druhý
raz ako kúpený karamel — čo dávku predražilo asi o 3,60 €.

Čokoládový veterník má recepty zapísané (čokoládová poleva, čokoládový
krém, vanilková šľahačka), ale nie je v ponuke na webe, takže nie je
priradený k žiadnej príchuti.

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

- **Suroviny** — kartotéka: balenie, cena, dátum posledného nákupu a
  obchod. Keď sa zmení cena a dátum sa nevyplní, doplní sa dnešok sám.
  Obchod je v stĺpci `price_source` — je to tá istá vec ako „odkiaľ je
  cena", len povedaná tak, ako sa o nej rozpráva.
- **Recepty** — tri časti. Celkom hore *Uložené recepty*: príchuť a
  počet kusov uložené pod menom, aby sa nemuseli vyberať zakaždým znova.
  Ukladá sa **výber, nie vypočítané gramáže** (`recipe_presets`:
  `product_id` + `pieces`) — po úprave receptu musí z uloženého vyjsť
  nové číslo, inak by sa po čase piekla podľa zamrznutých hodnôt.
  Je to niečo iné než nákupný zoznam v Kalkulačke: ten má termín, cenu
  a môže spájať viac príchutí, toto je skratka k jednému rozpisu.

  K uloženému receptu patrí aj vlastná **poznámka** (`recipe_presets.note`),
  ktorá sa vypisuje hneď nad rozpisom. Je to iná vec než `recipes.note`:
  tá platí vždy („variť vo väčšom hrnci"), táto platí pre konkrétne
  miešanie („na 20 ks robím dvojitú dávku craquelinu"). Keď rozpis vznikol
  len výberom hore, poznámka ešte nemá kam — uloží sa spolu s novým
  uloženým receptom, nech sa text nestratí.

  Tabuľka pribudla neskôr než zvyšok receptára, takže kým sa nespustí
  `supabase/migracia-ulozene-recepty.sql`, API vráti `ulozene: null`
  a záložka funguje ďalej bez nej — recepty ani ceny na nej nestoja.

  Potom *Čo mám miešať*: vyberie sa príchuť a
  počet kusov a vypíšu sa všetky recepty tej príchute s gramážou
  prepočítanou na ten počet (tlačidlo pošle ten istý počet do Kalkulačky).
  Dole *Úprava receptov*: zbalený zoznam, kde sa mení názov, výťažnosť,
  gramáže, poznámky pri surovinách, poznámka k receptu, postup, poradie
  surovín a priradenie k príchutiam; ukladá sa jedným tlačidlom.

  K výťažnosti patrí aj `recipes.yield_label` — čoho je tých 10 kusov
  („veterníkov", „choux"). Samotné „recept je na 10 ks" sa nedá prečítať,
  keď tá istá dávka vydá iný počet inej príchute. Je to voľný text a
  nič sa podľa neho nepočíta; prepočet drží `yield_qty` s
  `pieces_per_batch`.

  Poradie surovín drží stĺpec `recipe_items.sort_order` — v recepte na
  poradí záleží a databáza bez neho vracia riadky, ako sa jej zachce.

  **Druh receptu (cesto / krém / vklad / poleva / ozdoba / iné) sa
  neeviduje** — `supabase/migracia-bez-druhu-receptu.sql` stĺpec
  `recipes.kind` maže. Nikde sa podľa neho nepočítalo a z hlavičiek
  receptov zmizol už skôr; že je „Malinový curd" vklad, je vidieť
  z názvu. Ostávalo teda políčko, ktoré treba pri zakladaní receptu
  vyplniť a potom ho nikto nečíta. Cena za to je poradie v rozpise:
  riadilo sa druhom (najprv cesto, potom náplne), teraz je podľa abecedy
  ako všade inde. Druh SUROVINY (`ingredients.kind`) ostáva — podľa neho
  sa obal a réžia rátajú na kus, nie na gramy.

  Výťažnosť („recept je napísaný na 20 ks") sa mení len tlačidlom Uložiť,
  nikdy sama od seba. Keď sa ukladala pri každej zmene políčka, dala sa
  šípkou posunúť na 20,002 a ticho tým zmeniť cenu za kus.

  Recept priradený k príchuti sa zmazať nedá — najprv sa musí odobrať
  z príchutí, inak by príchuť prišla o časť zloženia bez varovania.
- **Kalkulačka** — nákupné zoznamy. Zoznam je samostatná vec: má termín,
  názov a súpis „príchuť + počet kusov", dá sa uložiť, upraviť aj zmazať
  a uložených môže byť viac. **Objednávkami nie je obmedzený** — suroviny
  sa kupujú vopred, keď objednávky ešte nie sú. Čo je na termín naozaj
  objednané, ukáže pomôcka dole a dá sa to do zoznamu prevziať.

  Položky zoznamu sú v jednom `jsonb` stĺpci (`shopping_plans.items`):
  zoznam sa vždy upravuje ako celok a nikdy sa nehľadá „vo všetkých
  zoznamoch, kde je pistáciový choux".

- **Peniaze** — čo prišlo a čo odišlo, za zvolené obdobie. Objednávka má
  `total_estimate` (za koľko je) a `paid_amount` (koľko za ňu naozaj
  prišlo) ako **dva samostatné údaje**. Nie je to duplicita: pri torte je
  cena „od 40 €" a dohaduje sa, inokedy zákazníčka nechá euro navyše.
  Rozdiel medzi nimi je informácia, nie chyba, a nikde sa nevolá
  „prepitné" — pri torte to prepitné nie je.

  `paid_amount` je zámerne bez `default 0`: prázdne znamená *ešte
  nezaplatené*, nula znamená *nedostala som nič*. Keby bola nula
  predvolená, každá nová objednávka by vyzerala ako zadarmo rozdaná a zo
  zoznamu nezaplatených by ticho vypadla.

  Nákup za obdobie sa berie z uložených nákupných zoznamov s termínom
  v rozsahu a **oceňuje sa po zoznamoch, nie zlúčene**: dva nákupy v dvoch
  týždňoch sú dve balenia masla, nie jedno zaokrúhlené nahor. Zoznam bez
  termínu nemá kam spadnúť — do súčtu nevstúpi a vypíše sa to.

  Dve obmedzenia, o ktorých majiteľka vie: nákup je odhad dnešnými cenami
  (zoznam si pamätá príchute a počty, nie ceny), a započíta sa len to, na
  čo existuje uložený zoznam.

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

## Curdy

`supabase/migracia-curdy.sql` pridáva dva recepty z kariet *CURDY*:

| Recept | Základ | Napísaný na |
|---|---|---|
| Malinový curd | pyré (robí sa z mrazených malín) | 300 g curdu |
| Citrónový curd | šťava priamo do curdu | 300 g curdu |

Sú napísané **na gramy, nie na kusy** — rovnako ako coulis. Koľko z nich
ide do jedného zákusku, sa povie až pri priradení k príchuti („Gramov do
jedného zákusku"); dovtedy nie sú priradené k žiadnej a do žiadneho
nákupného zoznamu nevstúpia.

Dve veci, o ktorých treba vedieť:

- **Malinové pyré sa kupuje aj robí.** Na karte je „150 g malinového pyré
  (z 1,5–2 násobku mrazeného ovocia)". V recepte je zapísaná existujúca
  surovina `Pyré malina` (24 €/kg), takže kalkulácia počíta s kupovaným
  pyré. Keď sa bude robiť z mrazených malín, treba založiť surovinu
  `Maliny mrazené` a v recepte ju vymeniť — cena za kus sa tým zmení.
- **Žĺtok je v číselníku v gramoch** (1 žĺtok = 20 g), preto sú z dvoch
  žĺtkov 40 g a z troch 60 g. Lyžica citrónovej šťavy je počítaná ako
  15 ml. Kôra z citróna je nová surovina `Citrón` v kusoch — šťava
  ostáva vedená zvlášť, lebo sa kupuje aj hotová.

## Čo ešte treba doplniť

Tieto veci sa dopĺňajú v správe webu, nie v kóde:

- **Obal** — `Krabička na zákusky` je založená bez ceny; kupuje sa podľa
  dostupnosti, cena sa vpíše po nákupe.
- **Balenie soli, sódy a vanilky** — ceny z excelu tam sú, gramáž balenia
  chýba, takže sa zatiaľ do ceny nerátajú a sú označené.
- **Pektín NH, agar, citrónová šťava, pyré jablko, pyré višňa** — recepty
  ich používajú, v číselníku neboli vôbec. Založené bez ceny.
- **Citrón** — pribudol kvôli kôre do citrónového curdu, cena za kus
  chýba.
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
