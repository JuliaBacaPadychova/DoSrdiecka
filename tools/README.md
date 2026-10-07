# Preklikanie v prehliadači

`npm test` overuje výpočty a API — čísla, pravidlá, odpovede servera.
Tieto dva skripty overujú to, čo z nich vidno v správe webu: že sa formulár
naozaj uloží, že sa zoznam prekreslí, že políčko je tam, kde má byť.
Veci, ktoré `node --test` nikdy nezachytí.

| Skript | Čo preklikáva |
|---|---|
| `prehliadac-sprava.js` | celú správu: suroviny, recepty, kalkulačku, peniaze, ručné objednávky |
| `prehliadac-pecenie.js` | celé pečenie naraz — objednávka s choux aj veterníkmi |

Bežia proti falošnému Supabase z `test/fake-supabase.js` a proti
`dev-server.js`, takže nepotrebujú účet, internet ani skutočné dáta.
Nič nezapisujú do repozitára; obrázky obrazovky ukladajú do dočasného
priečinka a cestu k nemu vypíšu na konci.

## Ako ich spustiť

Playwright **nie je** v `package.json` a ani tam nepatrí — projekt beží
zámerne na nule balíčkov a do nasadenia sa nič navyše dostať nemá.
Skripty si ho preto hľadajú tam, kde ho má ten, kto ich spúšťa:

```sh
NODE_PATH=/cesta/k/node_modules node tools/prehliadac-sprava.js
NODE_PATH=/cesta/k/node_modules node tools/prehliadac-pecenie.js
```

Keď Playwright nenájdu, povedia to a skončia — nespadnú na „Cannot find
module".

Premenné, keď treba:

| Premenná | Načo |
|---|---|
| `PREHLIADAC_PORT` | iný port, keď je ten predvolený obsadený |
| `PREHLIADAC_CHROMIUM` | cesta k prehliadaču, keď si ho Playwright nenájde sám |
| `PREHLIADAC_VYSTUP` | kam ukladať obrázky obrazovky |

## Čo vypíšu

Riadky `OK` a `CHYBA` a na konci chyby z konzoly prehliadača. Hotové je to
vtedy, keď nie je ani jedna `CHYBA` a skript skončí s kódom 0.

Zlyhané písmo z `fonts.googleapis.com` je v poriadku — kontajner nemá
internet a na overované veci to nemá vplyv.

## Keď prestanú fungovať

Prvé, čo zostarne, sú selektory formulárov: keď sa z poľa stane niečo iné
alebo sa premenuje, skript čaká na niečo, čo už neexistuje, a spadne na
timeout. Hláška povie, na ktorý prvok čakal. **Nie je to chyba webu** —
treba opraviť skript. Preto sú v repozitári a nie v dočasnom priečinku:
inak zostarnú potichu a zistí sa to až vtedy, keď sú na nič.
