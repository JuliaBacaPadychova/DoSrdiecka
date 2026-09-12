// Prepočet receptov na počet kusov, nákupný zoznam a náklady.
//
// Čisté funkcie bez databázy a bez siete — dajú sa otestovať cez
// `npm test` a nikam nechodia. Dáta dostanú tak, ako prídu zo Supabase
// (ingredients, recipes, recipe_items, product_recipes).
//
// Dve ceny, nie jedna:
//   spotreba = koľko surovín sa naozaj minie (na cenotvorbu)
//   nákup    = celé balenia, ktoré treba kúpiť (na nákupný zoznam)
// Pri pistáciovej paste je to rozdiel 24 € oproti 4,61 € — kupuje sa
// celé balenie, minie sa z neho pätina.

// Prečo riadok nemá cenu. Nič sa nikdy nezahodí potichu: v exceli to
// robil IFERROR a cena vychádzala nižšia, než bola.
const STAV = {
  OK: "ok",
  BEZ_MNOZSTVA: "bez_mnozstva",     // "štipka soli" — v recepte nemá gramáž
  CHYBA_BALENIE: "chyba_balenie",   // surovina nemá vyplnené balenie alebo cenu
  NERATA_SA: "nerata_sa",           // vedome mimo kalkulácie (voda)
};

function podlaId(riadky) {
  const m = new Map();
  for (const r of riadky) m.set(r.id, r);
  return m;
}

function zoskupit(riadky, kluc) {
  const m = new Map();
  for (const r of riadky) {
    const k = r[kluc];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}

// Pozor na Number(null) === 0: prázdne množstvo ("štipka soli") ani
// nevyplnená cena sa nesmú tváriť ako nula. Prázdne je prázdne.
function cislo(x) {
  if (x === null || x === undefined || x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

// Zaokrúhlenie na centy. Až na konci — nie medzi krokmi, aby sa chyby
// nesčítavali.
function eur(x) {
  return Math.round(x * 100) / 100;
}

// Koľko ktorej suroviny treba na zadané kusy.
//
// polozky = [{ product_id, kusy }] — pokojne viac príchutí naraz; to je
// to, čo excel nevedel, lebo SUMIF sčítaval len v rámci jedného hárku.
function potrebaSurovin(polozky, data) {
  const suroviny = podlaId(data.ingredients || []);
  const recepty = podlaId(data.recipes || []);
  const polozkyReceptu = zoskupit(data.recipe_items || [], "recipe_id");
  const vazby = zoskupit(data.product_recipes || [], "product_id");

  const vysledok = new Map();

  for (const { product_id, kusy } of polozky) {
    const pocet = cislo(kusy);
    if (!pocet || pocet <= 0) continue;

    for (const vazba of vazby.get(product_id) || []) {
      const recept = recepty.get(vazba.recipe_id);
      if (!recept) continue;

      const vytaznost = cislo(recept.yield_qty);
      if (!vytaznost || vytaznost <= 0) continue;

      // Koľko dávok receptu spotrebuje objednávka. qty_per_piece je
      // v jednotke výťažnosti receptu: pri receptoch na kusy je to 1,
      // pri coulis (recept na 150 g) je to počet gramov na kus.
      const podiel = (cislo(vazba.qty_per_piece) ?? 1) * pocet / vytaznost;

      for (const polozka of polozkyReceptu.get(recept.id) || []) {
        const surovina = suroviny.get(polozka.ingredient_id);
        if (!surovina) continue;

        if (!vysledok.has(surovina.id)) {
          vysledok.set(surovina.id, {
            surovina,
            mnozstvo: null,
            recepty: [],
            volitelna: true,
            bez_mnozstva: false,
          });
        }
        const riadok = vysledok.get(surovina.id);
        if (!riadok.recepty.includes(recept.name)) riadok.recepty.push(recept.name);
        // Voliteľná je len tá surovina, ktorá je voliteľná úplne všade,
        // kde sa v objednávke vyskytuje.
        if (!polozka.optional) riadok.volitelna = false;

        const mnozstvo = cislo(polozka.amount);
        if (mnozstvo === null) {
          riadok.bez_mnozstva = true;
        } else {
          riadok.mnozstvo = (riadok.mnozstvo ?? 0) + mnozstvo * podiel;
        }
      }
    }
  }

  return [...vysledok.values()];
}

// Cena jedného riadku nákupného zoznamu.
function ocenitRiadok(riadok) {
  const s = riadok.surovina;
  // Množstvo sa zaokrúhli na tisíciny gramu. Bez toho vyjde zo 48 × 14/10
  // hodnota 67,19999999999999 — na cenu to vplyv nemá, ale v nákupnom
  // zozname to vyzerá ako chyba.
  const mnozstvo = riadok.mnozstvo === null
    ? null
    : Math.round(riadok.mnozstvo * 1000) / 1000;
  const zaklad = {
    surovina: s.name,
    jednotka: s.unit,
    mnozstvo,
    recepty: riadok.recepty,
    volitelna: riadok.volitelna,
    spotreba: null,
    // Nezaokrúhlená spotreba. Súčet sa počíta z nej a zaokrúhli sa až
    // na konci — inak sa pri dvadsiatich riadkoch nazbiera z centov
    // rozdiel, ktorý v cene za kus už vidno.
    spotreba_presna: null,
    balenia: null,
    nakup: null,
  };

  if (s.negligible) return { ...zaklad, stav: STAV.NERATA_SA };
  if (mnozstvo === null) return { ...zaklad, stav: STAV.BEZ_MNOZSTVA };

  const balenie = cislo(s.pack_size);
  const cena = cislo(s.pack_price);
  if (!balenie || balenie <= 0 || cena === null) {
    return { ...zaklad, stav: STAV.CHYBA_BALENIE };
  }

  // Kúpiť sa dá len celé balenie. Epsilon je proti tomu, aby sa
  // z 2,0000000001 balenia (chyba desatinných čísel) stali tri.
  const balenia = Math.ceil(mnozstvo / balenie - 1e-9);

  return {
    ...zaklad,
    stav: STAV.OK,
    spotreba: eur(mnozstvo * cena / balenie),
    spotreba_presna: mnozstvo * cena / balenie,
    balenia,
    nakup: eur(balenia * cena),
  };
}

// Nákupný zoznam aj náklady pre zadané kusy.
function nakupnyZoznam(polozky, data) {
  const riadky = potrebaSurovin(polozky, data)
    .map(ocenitRiadok)
    .sort((a, b) => (b.spotreba ?? -1) - (a.spotreba ?? -1));

  let spotreba = 0;
  let nakup = 0;
  for (const r of riadky) {
    if (r.stav !== STAV.OK) continue;
    spotreba += r.spotreba_presna;
    nakup += r.nakup;
  }

  // Suroviny, ktoré do ceny nevstúpili, hoci mali. Kým je tento zoznam
  // neprázdny, je cena spodná hranica, nie skutočnosť.
  const nedopocitane = riadky
    .filter((r) => r.stav === STAV.CHYBA_BALENIE || r.stav === STAV.BEZ_MNOZSTVA)
    .map((r) => r.surovina);

  const kusy = polozky.reduce((s, p) => s + (cislo(p.kusy) || 0), 0);

  return {
    riadky,
    spotreba: eur(spotreba),
    nakup: eur(nakup),
    kusy,
    spotreba_na_kus: kusy > 0 ? eur(spotreba / kusy) : null,
    nakup_na_kus: kusy > 0 ? eur(nakup / kusy) : null,
    nedopocitane,
    uplna: nedopocitane.length === 0,
  };
}


// Rozpis receptov pre zadané kusy — čo a koľko treba naozaj namiešať.
//
// Toto je to, čo v exceli robili bunky C1 a C2: recept je napísaný na
// nejaký počet (yield_qty, C1), objednávka chce iný (C2), a množstvá sa
// vynásobia ich pomerom. Recept sa pritom NEMENÍ — mení sa len to, koľko
// dávok z neho treba.
//
// Keď dve príchute používajú ten istý recept (pistáciový krém ide do
// oboch), zlúčia sa do jedného rozpisu. Mieša sa raz, nie dvakrát.
function rozpisReceptov(polozky, data) {
  const suroviny = podlaId(data.ingredients || []);
  const recepty = podlaId(data.recipes || []);
  const polozkyReceptu = zoskupit(data.recipe_items || [], "recipe_id");
  const vazby = zoskupit(data.product_recipes || [], "product_id");

  const davkyReceptu = new Map();

  for (const { product_id, kusy } of polozky) {
    const pocet = cislo(kusy);
    if (!pocet || pocet <= 0) continue;

    for (const vazba of vazby.get(product_id) || []) {
      const recept = recepty.get(vazba.recipe_id);
      if (!recept) continue;
      const vytaznost = cislo(recept.yield_qty);
      if (!vytaznost || vytaznost <= 0) continue;

      const davky = (cislo(vazba.qty_per_piece) ?? 1) * pocet / vytaznost;
      const doteraz = davkyReceptu.get(recept.id);
      davkyReceptu.set(recept.id, {
        recept,
        davky: (doteraz ? doteraz.davky : 0) + davky,
        kusy: (doteraz ? doteraz.kusy : 0) + pocet,
      });
    }
  }

  return [...davkyReceptu.values()].map(({ recept, davky, kusy }) => ({
    recept: {
      id: recept.id,
      nazov: recept.name,
      druh: recept.kind,
      vytaznost: cislo(recept.yield_qty),
      jednotka_vytaznosti: recept.yield_unit,
      postup: recept.steps || "",
      poznamka: recept.note || "",
    },
    kusy,
    davky: Math.round(davky * 1000) / 1000,
    // Koľko toho z receptu vznikne — pri coulis (recept na 150 g) je to
    // v gramoch, pri kréme na 10 ks v kusoch.
    vytazok: Math.round(cislo(recept.yield_qty) * davky * 1000) / 1000,
    polozky: (polozkyReceptu.get(recept.id) || []).map((p) => {
      const surovina = suroviny.get(p.ingredient_id);
      const zakladne = cislo(p.amount);
      return {
        surovina: surovina ? surovina.name : "neznáma surovina",
        jednotka: surovina ? surovina.unit : "",
        zakladne,
        mnozstvo: zakladne === null ? null : Math.round(zakladne * davky * 1000) / 1000,
        volitelna: !!p.optional,
        poznamka: p.note || "",
      };
    }),
  }));
}

// Náklad na jeden kus jednej príchuti — na porovnanie s predajnou cenou.
// Počíta sa zo spotreby, nie z nákupu: celé balenie pistáciovej pasty
// nie je náklad jednej objednávky, zvyšok ostáva ako zásoba.
function cenaZaKus(product_id, data, kusy = 1) {
  const zoznam = nakupnyZoznam([{ product_id, kusy }], data);
  return {
    spotreba_na_kus: zoznam.spotreba_na_kus,
    nakup_na_kus: zoznam.nakup_na_kus,
    nedopocitane: zoznam.nedopocitane,
    uplna: zoznam.uplna,
  };
}

module.exports = { STAV, potrebaSurovin, ocenitRiadok, nakupnyZoznam, rozpisReceptov, cenaZaKus, eur };
