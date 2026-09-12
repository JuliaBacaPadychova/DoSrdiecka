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
