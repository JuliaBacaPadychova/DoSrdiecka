// Testy na prepočet receptov, nákupný zoznam a náklady.
//
// Čísla v prvom teste sú tie isté, ktoré vychádzali z excelu
// (Kalkulacka, pistáciový krém prepočítaný z 10 na 14 kusov), aby bolo
// vidieť, že prepočet dáva to isté — len navyše aj cenu spotreby a
// zoznam toho, čo sa nedalo dopočítať.

const test = require("node:test");
const assert = require("node:assert/strict");

const { STAV, nakupnyZoznam, rozpisReceptov, cenaZaKus } = require("../lib/kalkulacia");

const SUROVINY = [
  { id: "mas", name: "Mascarpone", unit: "g", pack_size: 250, pack_price: 2.53 },
  { id: "smo", name: "Smotana na šľahanie 33% (malá)", unit: "ml", pack_size: 180, pack_price: 1.43 },
  { id: "cok", name: "Čokoláda biela 28%", unit: "g", pack_size: 400, pack_price: 7.8 },
  { id: "pas", name: "Pasta pistáciová 100%", unit: "g", pack_size: 350, pack_price: 24 },
  { id: "cuk", name: "Cukor práškový", unit: "g", pack_size: 1000, pack_price: 1.65 },
  { id: "sol", name: "Soľ", unit: "g", pack_size: null, pack_price: 0.44 },
  { id: "van", name: "Vanilka", unit: "g", pack_size: 20, pack_price: 5 },
  { id: "vod", name: "Voda", unit: "ml", pack_size: null, pack_price: null, negligible: true },
  { id: "pyr", name: "Pyré malina", unit: "g", pack_size: 1000, pack_price: 24 },
  { id: "pek", name: "Pektín NH", unit: "g", pack_size: null, pack_price: null },
];

const RECEPTY = [
  { id: "krem", name: "Pistáciový krém", yield_qty: 10, yield_unit: "ks" },
  { id: "coulis", name: "Malinové coulis", yield_qty: 150, yield_unit: "g" },
];

const POLOZKY_RECEPTOV = [
  { recipe_id: "krem", ingredient_id: "mas", amount: 260 },
  { recipe_id: "krem", ingredient_id: "smo", amount: 85 },
  { recipe_id: "krem", ingredient_id: "cok", amount: 60 },
  { recipe_id: "krem", ingredient_id: "pas", amount: 48 },
  { recipe_id: "krem", ingredient_id: "cuk", amount: 20 },
  { recipe_id: "krem", ingredient_id: "sol", amount: null },
  { recipe_id: "krem", ingredient_id: "van", amount: null, optional: true },
  { recipe_id: "coulis", ingredient_id: "pyr", amount: 150 },
  { recipe_id: "coulis", ingredient_id: "pek", amount: 2.5 },
  { recipe_id: "coulis", ingredient_id: "vod", amount: 20 },
];

const VAZBY = [
  { product_id: "pistaciovy", recipe_id: "krem", qty_per_piece: 1 },
  { product_id: "kavovy", recipe_id: "krem", qty_per_piece: 1 },
  { product_id: "kavovy", recipe_id: "coulis", qty_per_piece: 12 },
];

const DATA = {
  ingredients: SUROVINY,
  recipes: RECEPTY,
  recipe_items: POLOZKY_RECEPTOV,
  product_recipes: VAZBY,
};

function riadok(zoznam, nazov) {
  return zoznam.riadky.find((r) => r.surovina === nazov);
}

test("prepočet z 10 na 14 kusov dáva tie isté množstvá ako excel", () => {
  const z = nakupnyZoznam([{ product_id: "pistaciovy", kusy: 14 }], DATA);

  assert.equal(riadok(z, "Mascarpone").mnozstvo, 364);        // 260 × 14/10
  assert.equal(riadok(z, "Pasta pistáciová 100%").mnozstvo, 67.2);
  assert.equal(riadok(z, "Čokoláda biela 28%").mnozstvo, 84);
});

test("nákup je celé balenia, spotreba len to, čo sa minie", () => {
  const z = nakupnyZoznam([{ product_id: "pistaciovy", kusy: 14 }], DATA);

  const pasta = riadok(z, "Pasta pistáciová 100%");
  assert.equal(pasta.balenia, 1);
  assert.equal(pasta.nakup, 24);       // celé balenie
  assert.equal(pasta.spotreba, 4.61);  // 67,2 g z neho

  const mascarpone = riadok(z, "Mascarpone");
  assert.equal(mascarpone.balenia, 2); // 364 g = dve balenia po 250 g
  assert.equal(mascarpone.nakup, 5.06);

  assert.equal(z.nakup, 39.94);
  assert.equal(z.spotreba, 10.92);
  assert.equal(z.spotreba_na_kus, 0.78);
  assert.equal(z.nakup_na_kus, 2.85);
});

test("surovina bez gramáže balenia sa označí, nezmizne", () => {
  const z = nakupnyZoznam([{ product_id: "pistaciovy", kusy: 14 }], DATA);

  const sol = riadok(z, "Soľ");
  assert.equal(sol.stav, STAV.BEZ_MNOZSTVA); // v recepte je len "štipka"
  assert.equal(sol.spotreba, null);
  assert.ok(z.nedopocitane.includes("Soľ"));
  assert.equal(z.uplna, false);
});

test("voda sa do ceny vedome neráta", () => {
  const z = nakupnyZoznam([{ product_id: "kavovy", kusy: 6 }], DATA);

  const voda = riadok(z, "Voda");
  assert.equal(voda.stav, STAV.NERATA_SA);
  assert.ok(voda.mnozstvo > 0, "množstvo sa aj tak ukáže");
  assert.ok(!z.nedopocitane.includes("Voda"), "nie je to chyba, je to rozhodnutie");
});

test("surovina bez ceny sa označí ako nedopočítaná", () => {
  const z = nakupnyZoznam([{ product_id: "kavovy", kusy: 6 }], DATA);

  const pektin = riadok(z, "Pektín NH");
  assert.equal(pektin.stav, STAV.CHYBA_BALENIE);
  assert.ok(pektin.mnozstvo > 0);
  assert.ok(z.nedopocitane.includes("Pektín NH"));
});

test("recept písaný na gramy sa prepočíta cez gramy na kus", () => {
  const z = nakupnyZoznam([{ product_id: "kavovy", kusy: 6 }], DATA);

  // 12 g coulis na kus × 6 kusov = 72 g z dávky na 150 g
  assert.equal(riadok(z, "Pyré malina").mnozstvo, 72);
  assert.equal(riadok(z, "Pektín NH").mnozstvo, 1.2);
});

test("viac príchutí naraz sa sčíta do jedného nákupného zoznamu", () => {
  const z = nakupnyZoznam(
    [{ product_id: "pistaciovy", kusy: 10 }, { product_id: "kavovy", kusy: 10 }],
    DATA,
  );

  // Pistáciový krém je v oboch príchutiach: 260 g + 260 g.
  assert.equal(riadok(z, "Mascarpone").mnozstvo, 520);
  assert.deepEqual(riadok(z, "Mascarpone").recepty, ["Pistáciový krém"]);
  assert.equal(z.kusy, 20);
});

test("presne na balenie sa nekupuje balenie navyše", () => {
  // 250 g mascarpone je presne jedno balenie — desatinné čísla nesmú
  // spôsobiť, že vyjde 1,0000000001 balenia a zaokrúhli sa na dve.
  const data = {
    ...DATA,
    recipes: [{ id: "r", name: "Test", yield_qty: 3, yield_unit: "ks" }],
    recipe_items: [{ recipe_id: "r", ingredient_id: "mas", amount: 750 }],
    product_recipes: [{ product_id: "t", recipe_id: "r", qty_per_piece: 1 }],
  };
  const z = nakupnyZoznam([{ product_id: "t", kusy: 1 }], data);
  assert.equal(riadok(z, "Mascarpone").mnozstvo, 250);
  assert.equal(riadok(z, "Mascarpone").balenia, 1);
});

test("neznáma príchuť alebo nula kusov nič nepokazí", () => {
  assert.equal(nakupnyZoznam([{ product_id: "niet", kusy: 5 }], DATA).riadky.length, 0);
  assert.equal(nakupnyZoznam([{ product_id: "pistaciovy", kusy: 0 }], DATA).riadky.length, 0);
  assert.equal(nakupnyZoznam([], DATA).spotreba, 0);
});

test("cena za kus vychádza zo spotreby a povie, či je úplná", () => {
  const c = cenaZaKus("pistaciovy", DATA, 10);
  assert.equal(c.spotreba_na_kus, 0.78);
  assert.equal(c.uplna, false);
  assert.deepEqual(c.nedopocitane, ["Soľ", "Vanilka"]);
});

// --- rozpis receptov (bunky C1 a C2 z excelu) ---

test("recept sa prepočíta na želaný počet kusov, sám sa nezmení", () => {
  const r = rozpisReceptov([{ product_id: "pistaciovy", kusy: 14 }], DATA);
  assert.equal(r.length, 1);

  const krem = r[0];
  assert.equal(krem.recept.nazov, "Pistáciový krém");
  assert.equal(krem.recept.vytaznost, 10, "výťažnosť receptu ostáva 10 ks");
  assert.equal(krem.davky, 1.4);

  const mascarpone = krem.polozky.find((p) => p.surovina === "Mascarpone");
  assert.equal(mascarpone.zakladne, 260, "základ z receptu ostáva");
  assert.equal(mascarpone.mnozstvo, 364, "prepočet na 14 kusov");
});

test("recept písaný na gramy sa prepočíta cez gramy na kus", () => {
  const r = rozpisReceptov([{ product_id: "kavovy", kusy: 6 }], DATA);
  const coulis = r.find((x) => x.recept.nazov === "Malinové coulis");

  // 12 g na kus × 6 kusov = 72 g z dávky na 150 g
  assert.equal(coulis.davky, 0.48);
  assert.equal(coulis.vytazok, 72);
  assert.equal(coulis.polozky.find((p) => p.surovina === "Pyré malina").mnozstvo, 72);
});

test("recept použitý v dvoch príchutiach sa mieša raz", () => {
  const r = rozpisReceptov(
    [{ product_id: "pistaciovy", kusy: 10 }, { product_id: "kavovy", kusy: 10 }],
    DATA,
  );
  const krem = r.filter((x) => x.recept.nazov === "Pistáciový krém");
  assert.equal(krem.length, 1, "nie dva samostatné rozpisy");
  assert.equal(krem[0].davky, 2);
  assert.equal(krem[0].polozky.find((p) => p.surovina === "Mascarpone").mnozstvo, 520);
});

test("surovina bez gramáže ostane v rozpise bez množstva", () => {
  const r = rozpisReceptov([{ product_id: "pistaciovy", kusy: 14 }], DATA);
  const sol = r[0].polozky.find((p) => p.surovina === "Soľ");
  assert.equal(sol.zakladne, null);
  assert.equal(sol.mnozstvo, null);
});

test("rozpis a nákupný zoznam sa nerozchádzajú", () => {
  const kusy = 14;
  const rozpis = rozpisReceptov([{ product_id: "pistaciovy", kusy }], DATA);
  const zoznam = nakupnyZoznam([{ product_id: "pistaciovy", kusy }], DATA);

  for (const r of rozpis) {
    for (const p of r.polozky) {
      if (p.mnozstvo === null) continue;
      const v = zoznam.riadky.find((x) => x.surovina === p.surovina);
      assert.equal(v.mnozstvo, p.mnozstvo, `${p.surovina} musí sedieť v oboch pohľadoch`);
    }
  }
});

test("nákupný zoznam je zoradený podľa slovenskej abecedy", () => {
  const z = nakupnyZoznam([{ product_id: "kavovy", kusy: 12 }], DATA);
  const nazvy = z.riadky.map((r) => r.surovina);
  const zoradene = [...nazvy].sort((a, b) => a.localeCompare(b, "sk"));
  assert.deepEqual(nazvy, zoradene);
  // Čokoláda patrí za Cukor, nie na koniec za Voda.
  assert.ok(nazvy.indexOf("Čokoláda biela 28%") < nazvy.indexOf("Pektín NH"));
});

// --- z jednej dávky vyjde pri každej príchuti iný počet kusov ---
//
// Z dávky odpalovaného cesta vyjde 20 choux, ale len 12 veterníkov —
// sú väčšie. Bez toho by sa na veterníky napočítalo cesta priveľa.

const DATA_VETERNIK = {
  ingredients: [{ id: "i-muka", name: "Múka hladká", unit: "g", pack_size: 1000, pack_price: 0.88 }],
  recipes: [{ id: "r-cesto", name: "Odpalované cesto", yield_qty: 20, yield_unit: "ks" }],
  recipe_items: [{ id: "ri", recipe_id: "r-cesto", ingredient_id: "i-muka", amount: 115 }],
  product_recipes: [
    { id: "v1", product_id: "choux", recipe_id: "r-cesto", qty_per_piece: 1 },
    { id: "v2", product_id: "veternik", recipe_id: "r-cesto", qty_per_piece: 1, pieces_per_batch: 12 },
  ],
};

test("dávka cesta vydá 20 choux, ale len 12 veterníkov", () => {
  const choux = rozpisReceptov([{ product_id: "choux", kusy: 20 }], DATA_VETERNIK)[0];
  assert.equal(choux.davky, 1, "20 choux = jedna dávka");
  assert.equal(choux.polozky[0].mnozstvo, 115);

  const veternik = rozpisReceptov([{ product_id: "veternik", kusy: 12 }], DATA_VETERNIK)[0];
  assert.equal(veternik.davky, 1, "12 veterníkov = tiež jedna dávka");
  assert.equal(veternik.polozky[0].mnozstvo, 115);

  // Na rovnaký počet kusov treba na veterníky viac cesta.
  const rovnako = rozpisReceptov([{ product_id: "veternik", kusy: 20 }], DATA_VETERNIK)[0];
  assert.ok(rovnako.davky > 1.66 && rovnako.davky < 1.67, "20 veterníkov je 1,667 dávky");
});

test("nákupný zoznam ráta s tým istým prepočtom ako rozpis", () => {
  const z = nakupnyZoznam([{ product_id: "veternik", kusy: 12 }], DATA_VETERNIK);
  assert.equal(z.riadky[0].mnozstvo, 115);
  const dvojnasobok = nakupnyZoznam([{ product_id: "veternik", kusy: 24 }], DATA_VETERNIK);
  assert.equal(dvojnasobok.riadky[0].mnozstvo, 230);
});

// --- torty: prepočet podľa priemeru a vrstiev ---
//
// Torta sa neškáluje počtom kusov, ale plochou. Čísla sú z PDF a z hárku
// "Prepocet vrstiev a kremu": z 12 na 18 cm je koeficient 2,25, a keď
// z tých 4 korpusov urobím 3, korpus je 2,25 x 0,75 = 1,6875.
const DATA_TORTA = {
  ingredients: [
    { id: "i-muka", name: "Múka T650", unit: "g", pack_size: 1000, pack_price: 0.88 },
    { id: "i-masc", name: "Mascarpone", unit: "g", pack_size: 250, pack_price: 2.53 },
  ],
  recipes: [
    { id: "r-korpus", name: "Brownie korpus", yield_qty: 1, yield_unit: "ks", diameter_cm: 12, layers: 4 },
    { id: "r-krem", name: "Brownie vanilkový krém", yield_qty: 1, yield_unit: "ks", diameter_cm: 12, layers: 3 },
    { id: "r-ganache", name: "Brownie ganache", yield_qty: 1, yield_unit: "ks", diameter_cm: 12, layers: 1 },
  ],
  recipe_items: [
    { id: "ri-1", recipe_id: "r-korpus", ingredient_id: "i-muka", amount: 90 },
    { id: "ri-2", recipe_id: "r-krem", ingredient_id: "i-masc", amount: 100 },
    { id: "ri-3", recipe_id: "r-ganache", ingredient_id: "i-masc", amount: 10 },
  ],
  product_recipes: [
    { id: "v-1", product_id: "t18", recipe_id: "r-korpus", qty_per_piece: 1 },
    { id: "v-2", product_id: "t18", recipe_id: "r-krem", qty_per_piece: 1 },
    { id: "v-3", product_id: "t18", recipe_id: "r-ganache", qty_per_piece: 1 },
    { id: "v-4", product_id: "t12", recipe_id: "r-korpus", qty_per_piece: 1 },
  ],
  products: [
    { id: "t18", name: "Brownie torta", sub: "Ø 18 cm", diameter_cm: 18 },
    { id: "t12", name: "Brownie torta", sub: "Ø 12 cm", diameter_cm: 12 },
  ],
};

test("torta na 12 cm je presne dávka z receptu", () => {
  const r = rozpisReceptov([{ product_id: "t12", kusy: 1 }], DATA_TORTA)[0];
  assert.equal(r.davky, 1);
  assert.equal(r.polozky[0].mnozstvo, 90);
});

test("z 12 na 18 cm sa gramáže násobia plochou, nie priemerom", () => {
  const rozpis = rozpisReceptov([{ product_id: "t18", kusy: 1 }], DATA_TORTA);
  const korpus = rozpis.find((r) => r.recept.nazov === "Brownie korpus");
  // 18x18 / 12x12 = 2,25. Keby sa počítalo priemerom, vyšlo by 1,5.
  assert.equal(korpus.davky, 2.25);
  assert.equal(korpus.polozky[0].mnozstvo, 202.5, "90 g muky x 2,25");
});

test("menej korpusov a krémov zmenší dávku každej zložky zvlášť", () => {
  const rozpis = rozpisReceptov(
    [{ product_id: "t18", kusy: 1, vrstvy: { "r-korpus": 3, "r-krem": 2 } }], DATA_TORTA);
  const korpus = rozpis.find((r) => r.recept.nazov === "Brownie korpus");
  const krem = rozpis.find((r) => r.recept.nazov === "Brownie vanilkový krém");
  const ganache = rozpis.find((r) => r.recept.nazov === "Brownie ganache");
  // Vypísaný počet dávok je zaokrúhlený na tisíciny (1,6875 -> 1,688),
  // samotné gramáže sa ale rátajú z nezaokrúhlenej hodnoty.
  assert.equal(korpus.davky, 1.688, "2,25 x 3/4");
  assert.equal(korpus.polozky[0].mnozstvo, 151.875, "90 g muky x 1,6875");
  assert.equal(krem.davky, 1.5, "2,25 x 2/3");
  assert.equal(krem.polozky[0].mnozstvo, 150);
  assert.equal(ganache.davky, 2.25, "ganache sa vrstvami neriadi, len plochou");
  assert.equal(ganache.polozky[0].mnozstvo, 22.5);
});

// Želé disk a obterová ganáž idú do torty raz bez ohľadu na to, koľko je
// korpusov — v recepte to hovorí prázdne "na koľko vrstiev". Keby sa brali
// ako recept na jednu vrstvu, hromadné políčko "Náplní: 2" by ich zdvojilo.
test("recept s prázdnymi vrstvami sa riadi len priemerom", () => {
  const data = {
    ...DATA_TORTA,
    recipes: [...DATA_TORTA.recipes,
      { id: "r-disk", name: "Malinový želé disk", yield_qty: 1, yield_unit: "ks",
        diameter_cm: 16, layers: null }],
    recipe_items: [...DATA_TORTA.recipe_items,
      { id: "ri-d", recipe_id: "r-disk", ingredient_id: "i-masc", amount: 200 }],
    product_recipes: [...DATA_TORTA.product_recipes,
      { id: "v-d", product_id: "t18", recipe_id: "r-disk", qty_per_piece: 1 }],
  };
  const disk = (vrstvy) => rozpisReceptov([{ product_id: "t18", kusy: 1, vrstvy }], data)
    .find((r) => r.recept.nazov === "Malinový želé disk");

  const bez = disk(undefined);
  assert.ok(Math.abs(bez.davky - 1.266) < 0.001, `18x18/16x16 = 1,266, vyšlo ${bez.davky}`);
  assert.equal(bez.na_tortu.vrstiev, null, "nemá sa na čo pýtať");

  // Aj keď zadanie vrstvy nesie (hromadné políčko), disku sa to nedotkne.
  const s2 = disk({ "r-disk": 2 });
  assert.equal(s2.davky, bez.davky, "dve náplne disk nezdvoja");
});

test("priemer zo zadania prebije priemer výrobku", () => {
  const r = rozpisReceptov([{ product_id: "t12", kusy: 1, priemer_cm: 16 }], DATA_TORTA)[0];
  // 16x16 / 12x12 = 1,7778 — v PDF zaokrúhlené na 1,7, my počítame presne.
  assert.ok(Math.abs(r.davky - 1.778) < 0.001, `vyšlo ${r.davky}`);
  assert.equal(r.na_tortu.priemer, 16);
});

test("dve torty sú dve dávky, nie jedna", () => {
  const r = rozpisReceptov([{ product_id: "t18", kusy: 2 }], DATA_TORTA)
    .find((x) => x.recept.nazov === "Brownie korpus");
  assert.equal(r.davky, 4.5);
});

test("nákupný zoznam na tortu ráta s tým istým koeficientom", () => {
  const z = nakupnyZoznam([{ product_id: "t18", kusy: 1 }], DATA_TORTA);
  const muka = z.riadky.find((r) => r.surovina === "Múka T650");
  assert.equal(muka.mnozstvo, 202.5);
});

test("recept bez priemeru sa priemerom neprepočítava", () => {
  // Zákusky ostávajú na kusoch aj vtedy, keď zadanie priemer nesie.
  const bezPriemeru = {
    ...DATA_VETERNIK,
    products: [{ id: "veternik", name: "Veterník", sub: "", diameter_cm: 18 }],
  };
  const r = rozpisReceptov([{ product_id: "veternik", kusy: 12, priemer_cm: 18 }], bezPriemeru)[0];
  assert.equal(r.davky, 1, "12 veterníkov je stále jedna dávka cesta");
});

// Ten istý sneh je 12 minipavloviek alebo JEDEN korpus na tortu. Torta
// je krajný prípad "kusov z dávky": z dávky vyjde jeden kus, takže celá
// dávka ide do jednej torty. Keby sa prázdne pieces_per_batch a jednotka
// niekedy poplietli, torta by dostala dvanástinu snehu.
const DATA_PAVLOVA = {
  ingredients: [{ id: "i-bielok", name: "Vajcia bielko", unit: "g", pack_size: 30, pack_price: 0.3 }],
  recipes: [{ id: "r-korpus", name: "Pavlova korpus", yield_qty: 12, yield_unit: "ks" }],
  recipe_items: [{ id: "ri-b", recipe_id: "r-korpus", ingredient_id: "i-bielok", amount: 125 }],
  product_recipes: [
    { id: "v-mini", product_id: "mini", recipe_id: "r-korpus", qty_per_piece: 1, pieces_per_batch: 12 },
    { id: "v-torta", product_id: "torta", recipe_id: "r-korpus", qty_per_piece: 1, pieces_per_batch: 1 },
  ],
};

test("dávka snehu je 12 minipavloviek alebo jeden korpus na tortu", () => {
  const mini = rozpisReceptov([{ product_id: "mini", kusy: 12 }], DATA_PAVLOVA)[0];
  assert.equal(mini.davky, 1, "12 minipavloviek = jedna dávka");
  assert.equal(mini.polozky[0].mnozstvo, 125);

  const torta = rozpisReceptov([{ product_id: "torta", kusy: 1 }], DATA_PAVLOVA)[0];
  assert.equal(torta.davky, 1, "jedna torta = tiež celá dávka");
  assert.equal(torta.polozky[0].mnozstvo, 125);

  const sest = rozpisReceptov([{ product_id: "mini", kusy: 6 }], DATA_PAVLOVA)[0];
  assert.equal(sest.davky, 0.5, "6 minipavloviek je pol dávky");

  // Torta a zákusky na ten istý deň sa musia sčítať do jedného receptu.
  const spolu = rozpisReceptov(
    [{ product_id: "torta", kusy: 1 }, { product_id: "mini", kusy: 6 }], DATA_PAVLOVA);
  assert.equal(spolu.length, 1, "je to jeden recept, nie dva riadky");
  assert.equal(spolu[0].davky, 1.5);
  assert.equal(spolu[0].polozky[0].mnozstvo, 187.5);
});

test("prázdne pieces_per_batch znamená výťažnosť receptu", () => {
  const bezUdaja = rozpisReceptov([{ product_id: "choux", kusy: 10 }], DATA_VETERNIK)[0];
  assert.equal(bezUdaja.davky, 0.5);
});

test("nula kusov z dávky nespôsobí delenie nulou", () => {
  const data = {
    ...DATA_VETERNIK,
    product_recipes: [{ id: "v3", product_id: "x", recipe_id: "r-cesto", qty_per_piece: 1, pieces_per_batch: 0 }],
  };
  assert.deepEqual(rozpisReceptov([{ product_id: "x", kusy: 10 }], data), []);
  assert.deepEqual(nakupnyZoznam([{ product_id: "x", kusy: 10 }], data).riadky, []);
});

test("výťažok sa počíta v kusoch tej príchute, nie receptu", () => {
  const veternik = rozpisReceptov([{ product_id: "veternik", kusy: 24 }], DATA_VETERNIK)[0];
  assert.equal(veternik.davky, 2, "24 veterníkov = dve dávky");
  assert.equal(veternik.vytazok, 24, "pokryje 24 veterníkov, nie 40 choux");
  assert.equal(veternik.kusov_z_davky, 12);

  const choux = rozpisReceptov([{ product_id: "choux", kusy: 20 }], DATA_VETERNIK)[0];
  assert.equal(choux.vytazok, 20);
  assert.equal(choux.kusov_z_davky, 20);
});

test("suroviny v rozpise idú v poradí, v akom prídu z databázy", () => {
  const data = {
    ingredients: [
      { id: "a", name: "Voda", unit: "ml", pack_size: null, pack_price: null, negligible: true },
      { id: "b", name: "Múka hladká", unit: "g", pack_size: 1000, pack_price: 0.88 },
      { id: "c", name: "Maslo 82%", unit: "g", pack_size: 250, pack_price: 3.08 },
    ],
    recipes: [{ id: "r", name: "Cesto", yield_qty: 10, yield_unit: "ks" }],
    // Tak, ako ich vráti databáza zoradené podľa sort_order.
    recipe_items: [
      { id: "1", recipe_id: "r", ingredient_id: "a", amount: 95, sort_order: 1 },
      { id: "2", recipe_id: "r", ingredient_id: "c", amount: 85, sort_order: 2 },
      { id: "3", recipe_id: "r", ingredient_id: "b", amount: 115, sort_order: 3 },
    ],
    product_recipes: [{ id: "v", product_id: "p", recipe_id: "r", qty_per_piece: 1 }],
  };
  const r = rozpisReceptov([{ product_id: "p", kusy: 10 }], data)[0];
  assert.deepEqual(r.polozky.map((x) => x.surovina), ["Voda", "Maslo 82%", "Múka hladká"]);
});

// „Recept je na 10 ks" nepovie, na 10 kusov čoho. Pri kréme písanom na
// 10 veterníkov je to podstatný rozdiel — z tej istej dávky vyjde iný
// počet choux než veterníkov.
test("popis výťažnosti prejde do rozpisu, prázdny ostane prázdny", () => {
  const data = {
    ...DATA,
    recipes: [
      { id: "krem", name: "Pistáciový krém", yield_qty: 10, yield_unit: "ks", yield_label: "veterníkov" },
      { id: "coulis", name: "Malinové coulis", yield_qty: 150, yield_unit: "g" },
    ],
  };
  const rozpis = rozpisReceptov([{ product_id: "kavovy", kusy: 20 }], data);
  const krem = rozpis.find((r) => r.recept.id === "krem");
  const coulis = rozpis.find((r) => r.recept.id === "coulis");

  assert.equal(krem.recept.popis_vytaznosti, "veterníkov");
  assert.equal(coulis.recept.popis_vytaznosti, "", "chýbajúci popis je prázdny text, nie undefined");
  assert.equal(krem.davky, 2, "popis nesmie zasiahnuť do prepočtu");
});

// --- peniaze ---
//
// Tri čísla, ktoré sa nesmú zliať do jedného: za koľko boli objednávky,
// koľko naozaj prišlo a čo stojí nákup.

const { prehladPenazi } = require("../lib/kalkulacia");

const OBJEDNAVKY = [
  { id: "o1", order_no: 1, day: "2026-09-10", customer_name: "Zuzka",
    status: "vybavena", total_estimate: 18, paid_amount: 19 },
  { id: "o2", order_no: 2, day: "2026-09-11", customer_name: "Eva",
    status: "nova", total_estimate: 12, paid_amount: null },
  { id: "o3", order_no: 3, day: "2026-09-12", customer_name: "Iva",
    status: "zrusena", total_estimate: 30, paid_amount: null },
  { id: "o4", order_no: 4, day: "2026-09-13", customer_name: "Mia",
    status: "vybavena", total_estimate: 40, paid_amount: 0 },
];

test("prijaté a objednané sú dve rôzne čísla, rozdiel ostáva vidieť", () => {
  const p = prehladPenazi(OBJEDNAVKY, [], DATA);
  assert.equal(p.objednavok, 3, "zrušená sa neráta");
  assert.equal(p.objednane, 70, "18 + 12 + 40, bez zrušenej");
  assert.equal(p.prijate, 19, "19 + 0");
  assert.equal(p.rozdiel, -51);
});

test("prázdna suma je nezaplatené, zapísaná nula nie", () => {
  const p = prehladPenazi(OBJEDNAVKY, [], DATA);
  assert.deepEqual(p.nezaplatene.map((o) => o.zakaznik), ["Eva"]);
  assert.equal(p.nezaplatene_suma, 12);
});

test("zrušená objednávka nie je dlh", () => {
  const p = prehladPenazi(OBJEDNAVKY, [], DATA);
  assert.ok(!p.nezaplatene.some((o) => o.zakaznik === "Iva"));
});

// Dva nákupy v dvoch týždňoch sú dve balenia masla, nie jedno
// zaokrúhlené nahor. Preto sa zoznamy oceňujú samostatne.
test("nákup sa počíta po zoznamoch, nie zlúčene", () => {
  const dva = [
    { id: "z1", name: "prvý", day: "2026-09-05", items: [{ product_id: "pistaciovy", kusy: 1 }] },
    { id: "z2", name: "druhý", day: "2026-09-19", items: [{ product_id: "pistaciovy", kusy: 1 }] },
  ];
  const zvlast = prehladPenazi([], dva, DATA);
  const spolu = prehladPenazi([], [
    { id: "z", name: "spolu", day: "2026-09-05", items: [{ product_id: "pistaciovy", kusy: 2 }] },
  ], DATA);

  assert.equal(zvlast.zoznamy.length, 2);
  assert.ok(zvlast.nakup > spolu.nakup,
    `dva samostatné nákupy (${zvlast.nakup}) musia stáť viac než jeden spoločný (${spolu.nakup})`);
  // Spotreba je naopak tá istá — minie sa rovnako veľa surovín.
  assert.equal(zvlast.spotreba, spolu.spotreba);
});

test("nedopočítané suroviny sa vypíšu raz, zoradené", () => {
  const p = prehladPenazi([], [
    { id: "z1", day: "2026-09-05", items: [{ product_id: "kavovy", kusy: 2 }] },
    { id: "z2", day: "2026-09-06", items: [{ product_id: "kavovy", kusy: 2 }] },
  ], DATA);
  assert.deepEqual(p.nedopocitane, ["Pektín NH", "Soľ", "Vanilka"],
    "každá raz, aj keď chýba v oboch zoznamoch, a po slovensky zoradené");
});
