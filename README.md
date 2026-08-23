# Do srdiečka — objednávkový web

Ostrá verzia klikacieho prototypu: rovnaký vzhľad a priebeh objednávky,
navyše s uložením objednávok, správou dní/limitov, e-mailovou notifikáciou
a admin prihlásením.

Krok-za-krokom návod na spustenie (pre netechnickú majiteľku) je v
[`docs/NAVOD-KROK-ZA-KROKOM.md`](docs/NAVOD-KROK-ZA-KROKOM.md).

## Architektúra (v skratke)

- **Hosting:** [Vercel](https://vercel.com) (statické súbory z `public/` + serverless funkcie z `api/`), zadarmo.
- **Databáza + admin prihlásenie:** [Supabase](https://supabase.com) (Postgres + Auth + Storage na fotky), zadarmo.
- **E-mailová notifikácia:** existujúca e-mailová schránka (SMTP), zadarmo.
- **Žiadne npm závislosti** — celý kód beží len na vstavaných Node.js moduloch
  (`fetch`, `tls`, `http`). Nič sa časom "nerozbije" kvôli zastaraným balíčkom.

```
public/            statický frontend (zákaznícka stránka + admin)
  index.html, assets/app.js, assets/styles.css
  admin/index.html, admin/app.js
api/               serverless funkcie (Vercel Node runtime)
  menu.js, days.js, orders.js         — verejné
  admin/login.js, admin/orders.js,    — chránené (Supabase Auth token)
  admin/days.js, admin/products.js,
  admin/settings.js, admin/upload.js,
  admin/refresh.js
lib/               zdieľaná logika (Supabase REST klient, e-mail cez SMTP, auth)
supabase/schema.sql databázová schéma + počiatočné dáta (spustiť raz v Supabase)
test/              automatizované testy (node --test)
```

## Business logika

- Denný limit sa nastavuje na deň (`open_days.cap_zakusky`, `cap_torty`).
- Zvyšná kapacita sa počíta z reálne prijatých (nezrušených) objednávok —
  pohľad `day_capacity` v `supabase/schema.sql`.
- Vytvorenie objednávky beží ako jedna atomická databázová funkcia
  (`create_order` v `supabase/schema.sql`), ktorá zamkne riadok dňa, takže aj
  pri dvoch súčasných objednávkach sa limit neprekročí.
- Minimálny odber (6 ks pri zákuskoch) aj maximálne 1 torta na deň sa
  kontrolujú na serveri — nie je možné ich obísť úpravou frontend kódu.

## Lokálny vývoj / testovanie

```
npm test        # automatizované testy (mailer + kapacitná logika v RPC)
npm run dev      # lokálny server na http://localhost:3000 (potrebuje .env.local)
```

`npm run dev` potrebuje reálne (alebo testovacie) Supabase premenné v
`.env.local` — pozri `.env.example`. Bez nich frontend nabehne, ale
volania na `/api/*` zlyhajú.
