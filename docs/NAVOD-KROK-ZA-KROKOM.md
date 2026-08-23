# Do srdiečka — návod na spustenie ostrej verzie (krok za krokom)

Tento návod predpokladá, že nie si programátorka — všade, kde treba niečo
zadať alebo kliknúť, je presne napísané kam a čo. Kód už je hotový a
uložený v GitHub repozitári; teraz ho treba len "zapojiť" do troch
bezplatných služieb a nastaviť doménu.

Postupuj v poradí A → B → C → D → E. Zaberie to dokopy asi 30–40 minút,
z toho väčšina je čakanie na potvrdzovacie e-maily.

---

## A) Supabase — databáza a tvoje prihlásenie

1. Choď na [supabase.com](https://supabase.com) → **Start your project** →
   prihlás sa cez e-mail alebo Google.
2. Klikni **New project**.
   - **Name:** `do-srdiecka` (alebo čokoľvek)
   - **Database Password:** vygeneruj a **ulož si ho niekam bezpečne**
     (heslopeňaženku, poznámku) — nebudeš ho v bežnej prevádzke potrebovať,
     ale pre prípad núdze nech ho máš.
   - **Region:** vyber najbližší (napr. Frankfurt/Central EU).
   - Klikni **Create new project** a počkaj cca 2 minúty, kým sa založí.
3. V ľavom menu choď na **SQL Editor** → **New query**.
4. Otvor v repozitári súbor `supabase/schema.sql`, skopíruj **celý jeho
   obsah**, vlož ho do editora v Supabase a klikni **Run**.
   - Toto vytvorí všetky tabuľky, pravidlá aj základnú ponuku (presne
     podľa prototypu) a pripraví miesto na fotky.
5. V ľavom menu choď na **Authentication** → **Users** → **Add user** →
   **Create new user**.
   - Zadaj **svoj e-mail** a **heslo, ktorým sa budeš prihlasovať do admin
     časti webu** (toto si vymysli teraz — bude to tvoje prihlásenie na
     `dosrdiecka.sk/admin`).
   - Zaškrtni **Auto Confirm User** (aby nemusela chodiť potvrdzovacia pošta).
   - Klikni **Create user**.
6. V ľavom menu choď na **Project Settings** (ozubené koliesko dole) →
   **API**. Tu uvidíš dve hodnoty, ktoré budeš potrebovať v kroku C:
   - **Project URL** (vyzerá ako `https://xxxxxxxx.supabase.co`)
   - **service_role** kľúč (v sekcii "Project API keys" — klikni na "Reveal"
     aby si ho videla). Je to dlhý reťazec znakov.

   ⚠️ **service_role kľúč je tajný** — má plný prístup k databáze. Neposielaj
   ho e-mailom ani nikam nevkladaj okrem miesta v kroku C nižšie.

---

## B) Vercel — kde web reálne beží

1. Choď na [vercel.com](https://vercel.com) → **Sign Up** → zvoľ
   **Continue with GitHub** a prihlás sa rovnakým GitHub účtom, pod ktorým
   je repozitár `dosrdiecka`.
2. Po prihlásení klikni **Add New…** → **Project**.
3. Nájdi repozitár **dosrdiecka** v zozname a klikni **Import**.
4. Na obrazovke nastavení projektu:
   - **Framework Preset:** nechaj `Other`.
   - **Build Command** aj **Output Directory**: nechaj prázdne/predvolené.
   - Pred kliknutím na Deploy pokračuj krokom C — potrebuješ tam vložiť
     tajné údaje, inak web nabehne, ale objednávky ani e-maily nebudú fungovať.

---

## C) Zadanie tajných údajov (ty sama, nikdy do kódu)

Stále na obrazovke nastavenia projektu vo Vercel (alebo neskôr cez
**Project → Settings → Environment Variables**) pridaj tieto premenné —
pre každú klikni **Add** a vyber, že platí pre **Production, Preview aj
Development**:

| Názov premennej | Čo tam patrí |
|---|---|
| `SUPABASE_URL` | Project URL zo Supabase (krok A.6) |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role kľúč zo Supabase (krok A.6) |
| `SMTP_HOST` | `smtp.m1.websupport.sk` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | `kolacik@dosrdiecka.sk` |
| `SMTP_PASSWORD` | **heslo k tvojej schránke** kolacik@dosrdiecka.sk (to, čo vidíš vo webmaile Websupportu) |

Toto je presne to miesto, kam zadávaš heslá **ty sama** — nikdy sa
neukladajú do kódu ani do GitHubu, len tu, vo Vercel nastaveniach, kam má
prístup len tvoj Vercel účet.

Keď sú všetky premenné vyplnené, klikni **Deploy**. Za cca minútu dostaneš
odkaz typu `dosrdiecka-xxxx.vercel.app` — over si na ňom, že stránka
funguje (zatiaľ na dočasnej adrese, doménu pripojíme v kroku D).

**Rýchla skúška:** otvor `https://dosrdiecka-xxxx.vercel.app/admin/` a
prihlás sa e-mailom a heslom z kroku A.5. Ak sa dostaneš do admin časti,
databáza aj prihlásenie fungujú.

---

## D) Pripojenie domény dosrdiecka.sk

1. Vo Vercel projekte choď na **Settings → Domains** → zadaj `dosrdiecka.sk`
   → **Add**.
2. Vercel ti ukáže presné DNS záznamy, ktoré treba nastaviť (zvyčajne
   jeden **A** záznam pre `dosrdiecka.sk` a jeden **CNAME** pre `www`).
3. Prihlás sa do správy domény u **Websupportu** (tam, kde spravuješ aj
   svoju schránku) → nájdi **DNS záznamy / DNS zóna** pre `dosrdiecka.sk`.
4. Pridaj/uprav záznamy presne podľa toho, čo ukázal Vercel v kroku D.2
   (skopíruj hodnoty 1:1).
   - ⚠️ Uisti sa, že **nezmažeš existujúce MX záznamy** (tie zabezpečujú
     tvoju e-mailovú schránku kolacik@dosrdiecka.sk) — meníš/pridávaš len
     A a CNAME záznamy pre web, pošty sa to netýka.
5. Návrat do Vercelu — po pár minútach až hodinách (podľa toho, ako rýchlo
   sa DNS zmena "rozšíri" po internete) sa pri doméne zobrazí zelená
   fajočka. Vercel zároveň automaticky zariadi zabezpečené **https://**.

Od tejto chvíle je web dostupný na `https://dosrdiecka.sk`.

---

## E) Prvé kroky v admin časti

Choď na `https://dosrdiecka.sk/admin/` a prihlás sa.

1. **Dni a limity** → pridaj prvé dni, na ktoré chceš prijímať objednávky
   (dátum + limit zákuskov + limit tort). Predvolené hodnoty 18 ks / 1 torta
   vieš pri každom dni zmeniť.
2. **Ponuka** → skontroluj, či sedia ceny/popisy/fotky (základná ponuka sa
   nahrala automaticky zo `schema.sql` s fotkami z prototypu). Fotku
   vieš kedykoľvek vymeniť nahratím novej.
3. **Nastavenia** → uprav úvodný text, ak chceš.
4. Skús si ako "zákazníčka" prejsť objednávku na `https://dosrdiecka.sk` a
   over, že ti do schránky `kolacik@dosrdiecka.sk` príde notifikácia.

---

## Bežná údržba (bez programátora)

- **Nový výrobok / zmena ceny, popisu, fotky:** admin → Ponuka → vyplň
  formulár hore → Uložiť. Fotku nahráš cez tlačidlo pri poli "Fotka".
- **Zatvorenie dňa / zmena limitu:** admin → Dni a limity.
- **Prehľad objednávok:** admin → Objednávky (vieš aj označiť ako
  "vybavená" alebo "zrušená" — zrušená sa automaticky uvoľní z kapacity
  toho dňa).
- **Zabudnuté heslo do admin časti:** Supabase → Authentication → Users →
  klikni na svoj e-mail → **Send password recovery** (alebo si nastav
  nové heslo priamo tam).
- **Ak niečo nefunguje:** Vercel → tvoj projekt → záložka **Logs** ukáže,
  čo presne zlyhalo (napr. zlé heslo v `SMTP_PASSWORD`). Tieto hlásenia
  vieš skopírovať a poslať programátorovi/Claude Code na pomoc, aj keby si
  sama nerozumela technickým detailom.
