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


// Torta sa neškáluje počtom kusov, ale PLOCHOU. Gramáže sa násobia
// pomerom druhých mocnín priemerov: z 12 na 18 cm je to 324/144 = 2,25.
// (Výška ostáva rovnaká, takže pomer plôch je aj pomerom objemov.)
//
// Druhý koeficient je počet vrstiev. Brownie korpus je napísaný na 4
// korpusy, krém na 3 vrstvy — keď z tej istej torty urobíš 3 korpusy,
// korpus sa násobí ešte 3/4. Každá zložka má vlastný počet, preto sa
// počíta zvlášť a nie jedným koeficientom na celú tortu.
//
// Vráti null, keď sa recept priemerom neprepočítava (nemá diameter_cm)
// alebo keď cieľový priemer nie je známy — vtedy platí prepočet na kusy.
function koeficientTorty(recept, vazba, kontext) {
  const priemerReceptu = cislo(recept.diameter_cm);
  const cielovy = cislo(kontext && kontext.priemer_cm);
  if (!priemerReceptu || priemerReceptu <= 0) return null;
  if (!cielovy || cielovy <= 0) return null;

  const plocha = (cielovy * cielovy) / (priemerReceptu * priemerReceptu);

  // Prázdne "na koľko vrstiev" znamená, že sa recept vrstvami NERIADI —
  // nie že je na jednu. Je to rozdiel: obterová ganáž a želé disk idú do
  // torty raz bez ohľadu na to, koľko je korpusov. Keby sa brali ako
  // recept na jednu vrstvu, zmena počtu náplní z 1 na 2 by ich zdvojila.
  const naRecept = cislo(recept.layers);
  if (naRecept === null || naRecept <= 0) return plocha;

  const zoZadania = kontext.vrstvy ? cislo(kontext.vrstvy[recept.id]) : null;
  const chcem = zoZadania ?? cislo(vazba.layers) ?? naRecept;
  if (chcem === null || chcem < 0) return plocha;

  return plocha * (chcem / naRecept);
}

// Koľko dávok receptu spotrebuje daný počet kusov.
//
// Recept písaný na kusy: dávka vydá toľko kusov, na koľko je napísaný —
// ibaže pri konkrétnej príchuti vydá iný počet. Z jednej dávky
// odpalovaného cesta vyjde 20 choux, ale len 12 veterníkov, lebo tie sú
// väčšie; vtedy má väzba vyplnené pieces_per_batch.
//
// Recept písaný na gramy (coulis na 150 g): dávky sa počítajú z toho,
// koľko gramov ide do jedného kusu.
//
// Recept na tortu (má priemer): prepočíta sa plochou a vrstvami, počet
// kusov je počet tort.
function davkyReceptu(recept, vazba, pocet, kontext) {
  const naTortu = koeficientTorty(recept, vazba, kontext);
  if (naTortu !== null) return naTortu * pocet;

  const vytaznost = cislo(recept.yield_qty);
  if (!vytaznost || vytaznost <= 0) return null;

  const naKus = cislo(vazba.qty_per_piece) ?? 1;
  if (recept.yield_unit === "g") return naKus * pocet / vytaznost;

  const zDavky = cislo(vazba.pieces_per_batch) ?? vytaznost;
  if (!zDavky || zDavky <= 0) return null;
  return naKus * pocet / zDavky;
}

// Na aký priemer sa počíta. Buď ho povie zadanie (majiteľka si v rozpise
// prepíše priemer), alebo ho nesie sám výrobok (Brownie torta Ø 20 cm).
function kontextPolozky(polozka, produkty) {
  const vyrobok = produkty.get(polozka.product_id);
  return {
    priemer_cm: cislo(polozka.priemer_cm) ?? (vyrobok ? cislo(vyrobok.diameter_cm) : null),
    vrstvy: polozka.vrstvy || null,
  };
}

// Koľko ktorej suroviny treba na zadané kusy.
//
// polozky = [{ product_id, kusy }] — pokojne viac príchutí naraz; to je
// to, čo excel nevedel, lebo SUMIF sčítaval len v rámci jedného hárku.
function potrebaSurovin(polozky, data) {
  const suroviny = podlaId(data.ingredients || []);
  const recepty = podlaId(data.recipes || []);
  const produkty = podlaId(data.products || []);
  const polozkyReceptu = zoskupit(data.recipe_items || [], "recipe_id");
  const vazby = zoskupit(data.product_recipes || [], "product_id");

  const vysledok = new Map();

  for (const polozka of polozky) {
    const { product_id, kusy } = polozka;
    const pocet = cislo(kusy);
    if (!pocet || pocet <= 0) continue;
    const kontext = kontextPolozky(polozka, produkty);

    for (const vazba of vazby.get(product_id) || []) {
      const recept = recepty.get(vazba.recipe_id);
      if (!recept) continue;

      const podiel = davkyReceptu(recept, vazba, pocet, kontext);
      if (podiel === null) continue;

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
  // Zoznam sa číta v obchode, nie pri analýze nákladov — preto podľa
  // abecedy, nie podľa ceny. Radí sa po slovensky, aby Čokoláda bola
  // za Cukrom a nie na konci.
  const riadky = potrebaSurovin(polozky, data)
    .map(ocenitRiadok)
    .sort((a, b) => a.surovina.localeCompare(b.surovina, 'sk'));

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
  const produkty = podlaId(data.products || []);
  const polozkyReceptu = zoskupit(data.recipe_items || [], "recipe_id");
  const vazby = zoskupit(data.product_recipes || [], "product_id");

  const davkyPodlaReceptu = new Map();

  for (const polozka of polozky) {
    const { product_id, kusy } = polozka;
    const pocet = cislo(kusy);
    if (!pocet || pocet <= 0) continue;
    const kontext = kontextPolozky(polozka, produkty);

    for (const vazba of vazby.get(product_id) || []) {
      const recept = recepty.get(vazba.recipe_id);
      if (!recept) continue;
      const davky = davkyReceptu(recept, vazba, pocet, kontext);
      if (davky === null) continue;
      // Pri torte sa nepočíta výťažok v kusoch, ale hovorí sa, na aký
      // priemer a koľko vrstiev sa práve počíta — inak by v rozpise
      // stálo "1,6875× dávka" a nebolo by z čoho.
      const naTortu = koeficientTorty(recept, vazba, kontext) !== null
        ? {
          priemer: cislo(kontext.priemer_cm),
          // Prázdne = recept sa vrstvami neriadi, tak sa ani nepýtame.
          vrstiev: cislo(recept.layers) === null ? null
            : ((kontext.vrstvy ? cislo(kontext.vrstvy[recept.id]) : null)
              ?? cislo(vazba.layers) ?? cislo(recept.layers)),
        }
        : null;
      // Výťažok sa sčítava priamo z toho, čo sa pokrýva: pri recepte na
      // kusy sú to kusy danej príchute (dávka cesta pokryje 12 veterníkov,
      // nie 20), pri recepte na gramy gramy.
      const vytazok = recept.yield_unit === "g"
        ? (cislo(vazba.qty_per_piece) ?? 1) * pocet
        : pocet;
      const doteraz = davkyPodlaReceptu.get(recept.id);
      davkyPodlaReceptu.set(recept.id, {
        recept,
        davky: (doteraz ? doteraz.davky : 0) + davky,
        kusy: (doteraz ? doteraz.kusy : 0) + pocet,
        vytazok: (doteraz ? doteraz.vytazok : 0) + vytazok,
        // Koľko kusov z dávky vyjde pri tejto príchuti. Keď sa recept
        // používa pri viacerých príchutiach s rôznym počtom, uvedie sa
        // ten posledný — na výpočet to vplyv nemá, je to len popis.
        kusov_z_davky: recept.yield_unit === "g"
          ? null
          : (cislo(vazba.pieces_per_batch) ?? cislo(recept.yield_qty)),
        na_tortu: naTortu || (doteraz ? doteraz.na_tortu : null),
      });
    }
  }

  return [...davkyPodlaReceptu.values()].map(({ recept, davky, kusy, vytazok, kusov_z_davky, na_tortu }) => ({
    recept: {
      id: recept.id,
      nazov: recept.name,
      vytaznost: cislo(recept.yield_qty),
      jednotka_vytaznosti: recept.yield_unit,
      // Na aký priemer a koľko vrstiev je recept NAPÍSANÝ. Bez toho sa
      // v rozpise nedá prečítať, z čoho ten koeficient vyšiel.
      priemer: cislo(recept.diameter_cm),
      vrstiev: cislo(recept.layers),
      // Čoho je tých 10 kusov — „veterníkov", „choux". Je to len popis,
      // nič sa podľa neho nepočíta; bez neho sa nedá z rozpisu prečítať,
      // že tá istá dávka vydá iný počet inej príchute.
      popis_vytaznosti: recept.yield_label || "",
      postup: recept.steps || "",
      poznamka: recept.note || "",
    },
    kusy,
    // Na aký priemer a vrstvy sa práve počíta (pri torte), alebo null.
    na_tortu: na_tortu || null,
    davky: Math.round(davky * 1000) / 1000,
    // Koľko toho z receptu vznikne — pri coulis (recept na 150 g) je to
    // v gramoch, pri kréme na 10 ks v kusoch.
    vytazok: Math.round(vytazok * 1000) / 1000,
    kusov_z_davky,
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

// Peniaze za obdobie: čo bolo objednané, čo naozaj prišlo a čo stojí
// nákup. Sú to tri rôzne čísla a žiadne z nich nenahrádza ostatné.
//
// Zrušené objednávky sa nerátajú nikam — ani do objednaného, ani do
// nezaplateného. Zrušená objednávka nie je dlh.
//
// Nezaplatená je objednávka s PRÁZDNOU sumou. Zapísaná nula znamená
// „nedostala som zaň nič" a je to vedomý zápis, nie chýbajúci údaj.
function prehladPenazi(objednavky, zoznamy, data) {
  const zive = (objednavky || []).filter((o) => o.status !== "zrusena");

  let objednane = 0;
  let prijate = 0;
  const nezaplatene = [];
  for (const o of zive) {
    objednane += cislo(o.total_estimate) || 0;
    const zaplatene = cislo(o.paid_amount);
    if (zaplatene === null) nezaplatene.push(o);
    else prijate += zaplatene;
  }

  // Každý zoznam sa oceňuje samostatne. Zlúčiť ich do jedného výpočtu by
  // nákup podstrelilo: dva nákupy v dvoch týždňoch sú dve balenia masla,
  // nie jedno zaokrúhlené nahor.
  const ocenene = (zoznamy || []).map((z) => {
    const vypocet = nakupnyZoznam(z.items || [], data);
    return {
      id: z.id,
      nazov: z.name || "",
      den: z.day || null,
      nakup: vypocet.nakup,
      spotreba: vypocet.spotreba,
      nedopocitane: vypocet.nedopocitane,
    };
  });

  const suma = (pole, kluc) => eur(pole.reduce((s, x) => s + (cislo(x[kluc]) || 0), 0));

  return {
    objednavok: zive.length,
    objednane: eur(objednane),
    prijate: eur(prijate),
    // Kladné číslo = prišlo viac, než bolo objednané. Pri tortách to nie
    // je prepitné, ale dohodnutá cena — preto sa to nikde nevolá inak
    // než rozdiel.
    rozdiel: eur(prijate - objednane),
    nezaplatene: nezaplatene.map((o) => ({
      id: o.id, cislo: o.order_no, den: o.day,
      zakaznik: o.customer_name, suma: cislo(o.total_estimate) || 0,
    })),
    nezaplatene_suma: eur(
      nezaplatene.reduce((s, o) => s + (cislo(o.total_estimate) || 0), 0)),
    zoznamy: ocenene,
    nakup: suma(ocenene, "nakup"),
    spotreba: suma(ocenene, "spotreba"),
    // Zoznam surovín, ktoré do ceny nevstúpili — kým je neprázdny, je
    // nákup spodná hranica, nie skutočnosť.
    nedopocitane: [...new Set(ocenene.flatMap((z) => z.nedopocitane))].sort(
      (a, b) => a.localeCompare(b, "sk")),
  };
}

module.exports = {
  STAV, potrebaSurovin, ocenitRiadok, nakupnyZoznam, rozpisReceptov,
  cenaZaKus, prehladPenazi, eur,
};
