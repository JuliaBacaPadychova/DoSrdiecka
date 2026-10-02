// Jednotka patrí riadku receptu, nie surovine: smotana sa kupuje v 500 ml
// krabici, ale do mousse sa odváži 120 g. Cena sa pritom počíta z balenia,
// takže množstvo treba previesť — a keď prevod nie je známy, surovina do
// ceny nevstúpi a vypíše sa medzi nedopočítanými.

const test = require("node:test");
const assert = require("node:assert/strict");

const { STAV, nakupnyZoznam, rozpisReceptov } = require("../lib/kalkulacia");

// Smotana: kupuje sa v ml, 500 ml za 2,40 €. 1 ml váži 1 g.
// Želatína: kupuje sa na kusy, 10 plátkov za 2 €, plátok 5 g.
function data(prepis = {}) {
  return {
    ingredients: [
      { id: "smo", name: "Smotana", unit: "ml", pack_size: 500, pack_price: 2.4,
        grams_per_ml: 1, ...(prepis.smo || {}) },
      { id: "zel", name: "Želatína plátková", unit: "ks", pack_size: 10, pack_price: 2,
        grams_per_ks: 5, ...(prepis.zel || {}) },
    ],
    recipes: [{ id: "mou", name: "Malinový mousse", yield_qty: 1, yield_unit: "ks" }],
    recipe_items: prepis.polozky || [
      { recipe_id: "mou", ingredient_id: "smo", amount: 120, unit: "g" },
    ],
    products: [{ id: "p", name: "Mousse", sub: "" }],
    product_recipes: [{ product_id: "p", recipe_id: "mou", qty_per_piece: 1 }],
  };
}

test("recept písaný v gramoch sa na nákup prepočíta na jednotku suroviny", () => {
  const z = nakupnyZoznam([{ product_id: "p", kusy: 1 }], data());
  const r = z.riadky[0];
  assert.equal(r.stav, STAV.OK);
  // 120 g pri 1 g/ml je 120 ml; nákupný zoznam sa číta v obchode, kde
  // sa smotana predáva v mililitroch.
  assert.equal(r.mnozstvo, 120);
  assert.equal(r.jednotka, "ml");
  assert.equal(r.spotreba, 0.58);   // 120/500 × 2,40
  assert.equal(r.balenia, 1);
  assert.equal(z.uplna, true);
});

test("hustota iná než 1 sa naozaj premietne do ceny", () => {
  // Olej: 120 g pri 0,9 g/ml je 133,333 ml, teda drahšie než 120 ml.
  const z = nakupnyZoznam([{ product_id: "p", kusy: 1 }],
    data({ smo: { grams_per_ml: 0.9 } }));
  const r = z.riadky[0];
  assert.equal(r.mnozstvo, 133.333);
  assert.equal(r.spotreba, 0.64);   // 133,333/500 × 2,40
});

test("chýbajúci prevod cenu nevymyslí, ale ju ani ticho nezahodí", () => {
  const z = nakupnyZoznam([{ product_id: "p", kusy: 1 }],
    data({ smo: { grams_per_ml: null } }));
  const r = z.riadky[0];
  assert.equal(r.stav, STAV.CHYBA_PREVOD);
  assert.equal(r.mnozstvo, null);
  assert.equal(r.spotreba, null);
  assert.equal(z.uplna, false);
  assert.deepEqual(z.nedopocitane, ["Smotana"]);
});

test("prepočítateľná časť sa nezapočíta, kým je v tej istej surovine diera", () => {
  // Dva recepty na tú istú surovinu: jeden v ml (ide to), druhý v g
  // (prevod chýba). Súčet by vyzeral hotovo a bol by nižší, než má byť.
  const d = data({
    smo: { grams_per_ml: null },
    polozky: [
      { recipe_id: "mou", ingredient_id: "smo", amount: 200, unit: null },
      { recipe_id: "mou2", ingredient_id: "smo", amount: 120, unit: "g" },
    ],
  });
  d.recipes.push({ id: "mou2", name: "Druhý mousse", yield_qty: 1, yield_unit: "ks" });
  d.product_recipes.push({ product_id: "p", recipe_id: "mou2", qty_per_piece: 1 });
  const z = nakupnyZoznam([{ product_id: "p", kusy: 1 }], d);
  assert.equal(z.riadky[0].stav, STAV.CHYBA_PREVOD);
  assert.equal(z.uplna, false);
});

test("prázdna jednotka znamená „ako surovina“ a nič neprepočítava", () => {
  const z = nakupnyZoznam([{ product_id: "p", kusy: 1 }], data({
    smo: { grams_per_ml: null },   // nie je potrebný, keď sa nemieša jednotka
    polozky: [{ recipe_id: "mou", ingredient_id: "smo", amount: 200, unit: null }],
  }));
  assert.equal(z.riadky[0].stav, STAV.OK);
  assert.equal(z.riadky[0].mnozstvo, 200);
});

test("kusy sa prevedú cez gramy rovnako ako mililitre", () => {
  // Recept chce 10 g želatíny, kupuje sa po plátkoch po 5 g → 2 plátky.
  const z = nakupnyZoznam([{ product_id: "p", kusy: 1 }], data({
    polozky: [{ recipe_id: "mou", ingredient_id: "zel", amount: 10, unit: "g" }],
  }));
  const r = z.riadky[0];
  assert.equal(r.stav, STAV.OK);
  assert.equal(r.mnozstvo, 2);
  assert.equal(r.jednotka, "ks");
  assert.equal(r.spotreba, 0.4);   // 2/10 × 2 €
});

test("mieša sa v tom, v čom je recept napísaný", () => {
  const [rozpis] = rozpisReceptov([{ product_id: "p", kusy: 2 }], data());
  const polozka = rozpis.polozky[0];
  assert.equal(polozka.jednotka, "g");    // nie "ml", v ktorých sa kupuje
  assert.equal(polozka.mnozstvo, 240);
});
