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
3. **Torta sa neprepočítava kusmi, ale plochou** — `(nový priemer² /
   pôvodný priemer²)`. Z 12 na 18 cm je to 324/144 = 2,25. Recept na tortu
   má vyplnený `recipes.diameter_cm` (na aký priemer je napísaný) a torta
   na webe má `products.diameter_cm`. Druhý koeficient je počet vrstiev:
   `recipes.layers` hovorí, na koľko je recept napísaný (brownie korpus 4,
   krém 3), `product_recipes.layers`, koľko ich ide do tejto torty. Spolu
   `koeficient = plocha × (koľko vrstiev / na koľko)`, čiže na 18 cm
   a 3 korpusy 2,25 × 0,75 = 1,6875. Každá zložka sa počíta zvlášť, lebo
   korpusov a krémov býva rôzny počet.

   V *Čo mám miešať* sa počet vrstiev zadáva **raz pre celú tortu** —
   políčka *Korpusov* a *Náplní*. Čím je ktorá zložka, drží skupina
   receptu (`recipe_groups.layer_role`): *Korpusy* (alebo *Cestá*, keď
   vlastná skupina na korpusy nie je) sú korpusy, *Krémy* a *Vklady*
   náplne, obter, poleva a disky sa vrstvami neriadia. Tortový korpus má
   zámerne vlastnú skupinu — odpalované cesto na choux je tiež cesto, ale
   s vrstvami torty nemá nič spoločné. Disk
   ani mousse nesmú byť medzi náplňami: do torty ide jeden disk bez
   ohľadu na počet vrstiev, takže by ich zmena počtu náplní zdvojila —
   preto majú vlastnú skupinu bez roly. Jednotlivý recept sa dá po tom
   ešte doladiť priamo v rozpise (karamel len v jednej vrstve).
   Je to ručný prepočet, nikam sa neukladá; trvalý počet vrstiev sa mení
   v *Úprave receptov* pri priradení.

   Priemer sa nezadáva — nesie si ho vybraná veľkosť torty. Rozmer mimo
   ponuky sa aj tak nedá objednať, takže políčko na priemer bolo len
   mätúce zdvojenie toho, čo už hovorí výber príchute.
   Recept bez priemeru (zákusky) sa počíta po starom, na kusy.
4. **Dve ceny, nie jedna:**
   - *spotreba* = `gramy × cena balenia / gramáž balenia` — čo naozaj
     minieš. Toto je číslo na cenotvorbu.
   - *nákup* = `zaokrúhli nahor(potreba / balenie) × cena balenia` — čo
     zaplatíš v obchode. Toto je číslo na nákupný zoznam.

   Rozdiel nie je malý. Pistáciový krém na 14 ks: nákup 39,94 € (2,85 €/ks),
   spotreba 10,92 € (0,78 €/ks). Pistáciová pasta stojí 24 € za balenie,
   ale minie sa jej 67 g — zvyšok nie je náklad tejto objednávky.
   Excel ukazoval len nákupnú cenu, takže cena za kus vychádzala vyššia,
   než v skutočnosti je.
5. **Nič nemizne potichu.** Keď surovina nemá vyplnené balenie (soľ, sóda,
   obal) alebo riadok nemá gramáž („štipka soli"), v kalkulácii sa vypíše
   ako *doplň balenie* / *bez gramáže*. V exceli ho `IFERROR` zahodil a
   cena vyšla nižšia, než bola.
6. **Voda** má `negligible = true` — do ceny sa vedome neráta.

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

  **Skupiny receptov** (`recipe_groups` + `recipes.group_id`) delia zoznam
  na Cestá, Krémy, Vklady, Polevy, Ganáže a Iné — nadpismi, v poradí,
  ktoré si majiteľka nastavila. Nie je to pevný zoznam v kóde: skupiny sa
  dajú pridať, premenovať aj preusporiadať v správe webu (`Skupiny
  receptov` nad zoznamom). Recept bez skupiny sa vypíše ako *Nezaradené*,
  a to navrch — nech je vidieť, čo ešte treba prehodiť, a nič sa nestratí
  na konci dlhého zoznamu. Zmazaná skupina recepty nemaže, len ich
  uvoľní (`on delete set null`).

  Kedysi mal recept namiesto toho stĺpec `kind` s pevným zoznamom druhov
  a `supabase/migracia-bez-druhu-receptu.sql` ho zmazal. Nie je to to isté
  vrátené späť: kind bolo políčko, ktoré treba vyplniť a nikto ho
  nečítal; skupina riadi, čo majiteľka vidí, a spravuje si ju sama.
  Druh SUROVINY (`ingredients.kind`) s tým nesúvisí a ostáva — podľa neho
  sa obal a réžia rátajú na kus, nie na gramy.

  **Poradie v rozpise** („čo mám miešať") drží `product_recipes.sort_order`,
  čiže sa nastavuje pri PRÍCHUTI, nie pri recepte. Poradie závisí od
  prípravy, nie od druhu: ríbezľová ganáž sa chladí tri hodiny, takže ide
  prvá, hoci je to krém — a pri inej príchuti to môže byť inak. Nastavuje
  sa šípkami priamo v rozpise a platí aj pre uložené recepty tej príchute.
  Nula znamená „nenastavené": vtedy platí poradie skupín a v rámci skupiny
  abeceda, takže rozpis dáva zmysel aj bez toho, aby ho niekto usporiadal.
  Prvý klik šípkou poradie očísluje podľa toho, ako je rozpis práve
  vypísaný — rovnako ako pri surovinách v recepte.

  Kým sa `supabase/migracia-skupiny-receptov.sql` nespustí, API vráti
  `skupiny: null` a celé zoskupovanie sa vypne — zoznam vyzerá ako
  predtým, bez nadpisov. Je to zámer: raz už kód počítal so stĺpcom,
  ktorý migrácia zmazala, a spadla celá záložka na „server_error".
  Tu je to naopak a záložka funguje pred migráciou aj po nej.

  Po každej úprave (pridanie suroviny, odobratie, uloženie) sa zoznam
  receptov načíta nanovo, ale **pohľad ostáva tam, kde bol**: `loadRecepty`
  si pred prekreslením zapamätá, ktoré recepty sú rozbalené a kde stránka
  stojí, a po ňom to vráti. Predtým to skočilo na začiatok stránky
  a recept sa zbalil — pri recepte o desiatich surovinách to znamenalo
  zakaždým znova doscrollovať a rozkliknúť. Zoznam sa počas načítavania
  ani nenahrádza hláškou „Načítavam": stránka by sa zrazila na pár
  riadkov a prehliadač by scroll posunul sám. Hláška je len pri prvom
  otvorení záložky.

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
  pyré. Surovina `Maliny mrazené` už v číselníku je (pribudla s coulis na
  pavlovu), takže ak sa pyré bude robiť z nich, stačí ju v recepte
  vymeniť — cena za kus sa tým zmení.
- **Žĺtok je v číselníku v gramoch** (1 žĺtok = 20 g), preto sú z dvoch
  žĺtkov 40 g a z troch 60 g. Lyžica citrónovej šťavy je počítaná ako
  15 ml. Kôra z citróna je nová surovina `Citrón` v kusoch — šťava
  ostáva vedená zvlášť, lebo sa kupuje aj hotová.

## Pavlova: jeden sneh, dva výrobky

`supabase/migracia-pavlova-korpus.sql` pridáva recept **Pavlova korpus**
z karty „PAVLOVA — MINIPAVLOVKY": 125 g bielkov, 215 g krupicového cukru,
1,5 ČL škrobu (10,5 g) a 1 ČL octu (5 ml), sušenie 140/100 °C, 100 minút.

Je to **jeden recept priradený k dvom výrobkom**, nie dva recepty — ten
istý sneh, iný tvar:

| Výrobok | Kusov z dávky | Čo to znamená |
|---|---:|---|
| Mini Pavlova — Jemná klasika | 12 | dávka vydá 12 minipavloviek 6–7 cm |
| Pavlova torta — Ø 20 cm | 1 | celá dávka je jeden korpus |

Je to ten istý mechanizmus ako pri odpalovanom ceste (20 choux vs.
12 veterníkov), len dotiahnutý do krajnosti: pri torte vyjde z dávky
jediný kus. Torta a minipavlovky na ten istý termín sa preto v nákupnom
zozname sčítajú do jedného receptu — 1 torta a 6 minipavloviek je
1,5 dávky snehu, nie dva samostatné riadky.

Dve veci sú v recepte zapísané ako **otvorené**, lebo na karte nie sú:

- či dávka stačí na celý priemer Ø 20 cm (ak nie, stačí pri torte zmeniť
  „kusov z dávky" — 0,667 znamená dávku a pol na jednu tortu),
- ako dlho sa suší korpus na tortu; je hrubší než minipavlovka, takže
  100 minút z karty pre neho neplatí. Skutočný čas patrí do postupu po
  prvom pečení.

„Chcem inú kombináciu chutí" priradené nie je — tam sa zloženie dohaduje
z poznámky k objednávke, rovnako ako pri Choux.

### Krém a coulis na tortu

`supabase/migracia-pavlova-krem.sql` dopĺňa k tortě zvyšok karty
„PAVLOVA 20 cm": **Pavlova krém** (380 g mascarpone, 380 ml šľahačky
min. 33 %, 100 g práškového cukru, štipka vanilky) a **Pavlova malinové
coulis** (200 g mrazených malín, 40 g kryštálového cukru). Oba sú
napísané na jednu tortu Ø 20 cm, takže dve torty si vypýtajú dve dávky.

Názvy začínajú slovom „Pavlova" zámerne: v abecednom zozname stoja vedľa
seba a je z nich vidieť, že inde sa nepoužívajú.

**Doplnky sú medzi surovinami**, nie len v poznámke: marakuja (4 ks —
karta hovorí 3–4, v nákupnom zozname je lepšie mať o plod viac) a ovocie
na ozdobu. Ovocie je zámerne **bez gramáže aj bez ceny**, lebo sa mení
podľa sezóny a dohody so zákazníčkou: v recepte je vidieť, do ceny
nevstupuje a kalkulácia ho vypíše medzi nedopočítanými. Vymyslené číslo
by bolo horšie než priznaná medzera.

### Krém z čiernych ríbezlí na minipavlovky

`supabase/migracia-pavlova-ribezle.sql` pridáva **Pavlova krém z čiernych
ríbezlí** z druhej karty na minipavlovky — napísaný na 12 minipavloviek:
160 g mrazených čiernych ríbezlí, 100 g bielej čokolády 28 %, 120 g
mascarpone, 200 ml šľahačky min. 33 %, 40 g práškového cukru a ovocie na
ozdobu.

Ganáž a krém sú na karte dve časti, ale v databáze je to **jeden recept**.
Celá ganáž ide do tohto krému a nikde inde sa nepoužíva; samostatný recept
by znamenal dve miesta na opravu a riziko, že sa ríbezle započítajú
dvakrát — presne to sa v exceli stalo karamelu. (Karamel je samostatný
recept preto, že sa *delí* medzi polevu a šľahačku.) Obe fázy vrátane
troch hodín chladenia sú v postupe oddelené.

Ríbezle sú vedené **mrazené, nie ako pyré**: karta hovorí „80 g pyré
z dvojnásobku, čiže zo 160 g mrazeného ovocia", a kupuje sa tých 160 g.
Pri malinovom curde je to zatiaľ naopak (kupované `Pyré malina`) — keby
sa aj ten robil z mrazených, stačí surovinu v recepte vymeniť.

K príchuti recept priradený nie je. Mini Pavlova má na webe jedinú
konkrétnu príchuť „Jemná klasika" a tá je popísaná ako *vanilkový krém,
lemon curd a čerstvé maliny* — teda iný krém. Priradiť k nej ríbezľový
krém by ticho zmenilo to, čo si zákazníčka objednáva; či ide o novú
príchuť alebo o novú podobu Jemnej klasiky, je rozhodnutie majiteľky.

Karta k tomuto krému počíta ešte **100–130 g citrónového curdu** na dávku
(1–2 ČL do jednej minipavlovky, čiže cca 10 g na kus). Curd je vlastný
recept, takže sa k príchuti priradí ako recept s gramážou na kus, nie ako
surovina.

### Prečo sú dve malinové coulis

`Malinové coulis` (do choux) a `Pavlova malinové coulis` nie sú tá istá
receptúra napísaná dvakrát:

| | Malinové coulis | Pavlova malinové coulis |
|---|---|---|
| Základ | 150 g kupovaného pyré | 200 g mrazených malín |
| Cukor | 15 g (10 g na 100 g ovocia) | 40 g (20 g na 100 g) |
| Pektín NH | 2,5 g | žiadny |
| Citrónová šťava | pár kvapiek | žiadna |
| Ako hustne | tuhne pektínom | odparením, potom sa mixuje a pasíruje |

Prvé musí držať tvar vo vnútri choux, druhé sa vrstvi na korpus. Jedno
pre oboje by znamenalo buď želé na pavlove, alebo coulis vytečené
z choux.

## Brownie torta

`supabase/migracia-brownie-torta.sql` prenáša PDF *BROWNIE TORTA* a excel
*Brownie torta mousse disk*. Päť receptov s prefixom **Brownie** (korpus,
slaný karamel, vanilkový krém, ovocné coulis, ganache), všetky napísané na
Ø 12 cm, plus štyri vklady bez prefixu, ktoré sa dajú použiť aj inde:
*Malinový želé disk* a *Malinový mousse* (Ø 16), *Jahodové compoté* (Ø 16)
a *Mangový mousse* (Ø 18).

Recepty sú priradené ku **všetkým veľkostiam naraz** — priemer si každá
veľkosť nesie sama, takže recept netreba kopírovať. Objednávka na
Ø 20 cm sa v nákupnom zozname prepočíta sama; dovtedy sa neprepočítavala
vôbec.

Kde sa PDF a excel nezhodli, platí PDF a rozhodnutie majiteľky:

| Vec | Ako je to zapísané |
|---|---|
| Práškový cukor v kréme | 50 g (PDF), nie 30 g z hárku *Kalkulacka* |
| Cukor muscovado | vedený ako `Cukor trstinový`, tak ako to má excel |
| Slaný karamel | celá dávka z PDF; v *Kalkulacke* chýbala. Vyjde jej viac, než sa do 12 cm torty zmestí — koľko naozaj treba, sa upraví po prvom skladaní |
| Ovocné coulis | doplnené podľa PDF; v *Kalkulacke* chýbalo celé. Ovocie je `Ovocná zmes mrazená` |
| Prášok, sóda, soľ | v gramoch podľa bežného prepočtu lyžičiek, lyžička ostáva v poznámke |

To posledné potrebovalo rozhodnutie. V recepte sú lyžičky, ale lyžička sa
nedá prepočítať na iný priemer — pri Ø 22 cm (koeficient 3,36) by z pol
lyžičky prášku mala byť skoro jeden a pol. Preto je zapísaná **gramáž**
a lyžička ostáva v poznámke pri surovine, takže v rozpise je vidieť oboje:

| Surovina | V recepte | Zapísané | Pri Ø 22 cm vyjde |
|---|---|---:|---:|
| Prášok do pečiva | ½ lyžičky | 2 g | 6,7 g |
| Sóda bikarbóna | ¼ lyžičky | 1,25 g | 4,2 g |
| Soľ (korpus) | ½ lyžičky | 3 g | 10,1 g |
| Soľ (karamel) | 1 lyžička | 6 g | — |

Prepočet je bežný kuchynský odhad (lyžička prášku ~ 4 g, sódy ~ 5 g,
soli ~ 6 g), nie vážené meranie. Keby po odvážení vyšlo iné číslo, prepíše
sa v správe webu. Vanilka v kréme ostáva bez gramáže — „1 struk alebo
1 lyžička pasty" sa na gramy previesť nedá bez toho, aby to bola fikcia.

Vrstvy sú nastavené takto: korpus 4, krém 3, coulis 3 (ide na prvý, druhý
aj tretí korpus), slaný karamel 3 (hárok *Prepocet vrstiev a kremu*
odporúča pri ňom rovnaký koeficient ako pri kréme) a ganache 1 — tá sa
vrstvami neriadi, len plochou.

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
- **Ocot** — pribudol kvôli korpusu na pavlovu, balenie ani cena nie sú.
  Je ho v dávke 5 ml, takže na cenu za kus to vplyv nemá.
- **Ovocná zmes mrazená**, **Pyré jahoda**, **Jahody čerstvé**,
  **Limetková šťava**, **Čokoláda biela 32%** — pribudli kvôli brownie
  torte a vkladom, cena ani balenie nie sú. Kým tam nie sú, cena torty je
  podhodnotená.
- **Maliny mrazené**, **Čierne ríbezle mrazené**, **Marakuja** — pribudli
  kvôli pavlove, cena ani balenie nie sú. Bez nich vyjde kalkulácia nižšie,
  než je pravda.
- **Ovocie na ozdobu** — bez ceny zostane aj naďalej, je to vedomé
  rozhodnutie (mení sa podľa sezóny). Do ceny torty ho treba prirátať
  zvlášť.
- **Zloženie Mini Pavlovy** — priradený je zatiaľ len korpus. Recepty na
  krém z čiernych ríbezlí aj citrónový curd už v receptári sú, ale
  k príchuti priradené nie sú: najprv treba vedieť, ku ktorej príchuti
  patria. Pri Pavlova torte je zloženie kompletné (korpus, krém, coulis).
- **Krém a coulis pre Mini Pavlovu** — recepty z karty na tortu sa dajú
  priradiť aj k nej, len treba vedieť, koľko minipavloviek z jednej dávky
  vyjde. Karta to nehovorí, preto to priradenie zatiaľ nie je.
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
