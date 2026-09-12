// Testy na nákupný zoznam počítaný zo skutočných objednávok.
//
// Toto je to, čo excel nevedel: počty kusov sa neprepisujú ručne, berú
// sa z prijatých objednávok na daný deň. Zrušená objednávka sa nesmie
// rátať — inak by sa nakúpilo na koláče, ktoré nikto nechce.

const test = require("node:test");
const assert = require("node:assert/strict");

const { startFakeSupabase } = require("./fake-supabase");
const { authLogin } = require("../lib/supabase");

function fakeRes() {
  const out = {};
  return {
    out,
    status(code) { out.code = code; return this; },
    json(body) { out.body = body; return this; },
    setHeader() { return this; },
    end(text) { if (text) out.body = JSON.parse(text); return this; },
  };
}

// Receptár nastavený tak, aby sa dal prepočet overiť ručne:
// jeden choux = 26 g mascarpone (260 g na 10 kusov).
function naplnReceptar(db) {
  db.ingredients.push(
    { id: "i-mas", name: "Mascarpone", unit: "g", pack_size: 250, pack_price: 2.53, negligible: false },
    { id: "i-sol", name: "Soľ", unit: "g", pack_size: null, pack_price: 0.44, negligible: false },
  );
  db.recipes.push({ id: "r-krem", name: "Pistáciový krém", kind: "krem", yield_qty: 10, yield_unit: "ks" });
  db.recipe_items.push(
    { id: "ri-1", recipe_id: "r-krem", ingredient_id: "i-mas", amount: 260, optional: false },
    { id: "ri-2", recipe_id: "r-krem", ingredient_id: "i-sol", amount: null, optional: false },
  );
  db.product_recipes.push({ id: "pr-1", product_id: "p-choux", recipe_id: "r-krem", qty_per_piece: 1 });
}

async function sReceptarom(t, fn) {
  const fake = await startFakeSupabase();
  naplnReceptar(fake.db);
  process.env.SUPABASE_URL = fake.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fake";
  process.env.ADMIN_EMAILS = fake.adminCredentials.email;
  t.after(async () => { await fake.close(); });

  const handler = require("../api/admin/kalkulacia");
  const relacia = await authLogin(fake.adminCredentials.email, fake.adminCredentials.password);

  const zavolaj = async (url, telo) => {
    const res = fakeRes();
    await handler({
      method: telo ? "POST" : "GET",
      url,
      headers: { authorization: `Bearer ${relacia.access_token}` },
      body: telo,
    }, res);
    return res.out;
  };

  await fn({ db: fake.db, zavolaj });
}

function objednavka(db, { id, day, status, kusy }) {
  db.orders.push({ id, day, status, customer_name: "Zákazníčka", phone: "", email: "", note: "" });
  db.order_items.push({
    id: `oi-${id}`, order_id: id, product_id: "p-choux", category_id: "zakusky",
    name_snapshot: "Choux", sub_snapshot: "Pistáciovo mangový", price_snapshot: 3, qty: kusy,
  });
}

test("nákupný zoznam sa spočíta z objednávok dňa", async (t) => {
  await sReceptarom(t, async ({ db, zavolaj }) => {
    objednavka(db, { id: "o1", day: "2026-10-18", status: "nova", kusy: 6 });
    objednavka(db, { id: "o2", day: "2026-10-18", status: "vybavena", kusy: 4 });

    const odpoved = await zavolaj("/api/admin/kalkulacia?day=2026-10-18");
    assert.equal(odpoved.code, 200);
    assert.equal(odpoved.body.pocet_objednavok, 2);

    const mascarpone = odpoved.body.zoznam.riadky.find((r) => r.surovina === "Mascarpone");
    assert.equal(mascarpone.mnozstvo, 260);   // 10 kusov = celá dávka
    assert.equal(mascarpone.balenia, 2);      // 260 g sa do jedného balenia nezmestí
    assert.equal(mascarpone.nakup, 5.06);
  });
});

test("zrušená objednávka sa do nákupu neráta", async (t) => {
  await sReceptarom(t, async ({ db, zavolaj }) => {
    objednavka(db, { id: "o1", day: "2026-10-18", status: "nova", kusy: 6 });
    objednavka(db, { id: "o2", day: "2026-10-18", status: "zrusena", kusy: 30 });

    const odpoved = await zavolaj("/api/admin/kalkulacia?day=2026-10-18");
    assert.equal(odpoved.body.pocet_objednavok, 1);
    const mascarpone = odpoved.body.zoznam.riadky.find((r) => r.surovina === "Mascarpone");
    assert.equal(mascarpone.mnozstvo, 156); // 260 × 6/10
  });
});

test("objednávky iného dňa sa nemiešajú", async (t) => {
  await sReceptarom(t, async ({ db, zavolaj }) => {
    objednavka(db, { id: "o1", day: "2026-10-18", status: "nova", kusy: 6 });
    objednavka(db, { id: "o2", day: "2026-10-19", status: "nova", kusy: 12 });

    const odpoved = await zavolaj("/api/admin/kalkulacia?day=2026-10-19");
    const mascarpone = odpoved.body.zoznam.riadky.find((r) => r.surovina === "Mascarpone");
    assert.equal(mascarpone.mnozstvo, 312); // 260 × 12/10
  });
});

test("surovina bez gramáže balenia sa vypíše, cena sa označí za neúplnú", async (t) => {
  await sReceptarom(t, async ({ db, zavolaj }) => {
    objednavka(db, { id: "o1", day: "2026-10-18", status: "nova", kusy: 10 });

    const z = (await zavolaj("/api/admin/kalkulacia?day=2026-10-18")).body.zoznam;
    assert.equal(z.uplna, false);
    assert.ok(z.nedopocitane.includes("Soľ"));
  });
});

test("ručný prepočet ráta to isté ako prepočet z objednávok", async (t) => {
  await sReceptarom(t, async ({ db, zavolaj }) => {
    objednavka(db, { id: "o1", day: "2026-10-18", status: "nova", kusy: 14 });

    const zoDna = (await zavolaj("/api/admin/kalkulacia?day=2026-10-18")).body.zoznam;
    const rucne = (await zavolaj("/api/admin/kalkulacia", {
      polozky: [{ product_id: "p-choux", kusy: 14 }],
    })).body.zoznam;

    assert.deepEqual(rucne.riadky, zoDna.riadky);
    assert.equal(rucne.spotreba, zoDna.spotreba);
  });
});

test("bez prihlásenia sa nákupný zoznam nedá prečítať", async (t) => {
  await sReceptarom(t, async ({ zavolaj }) => {
    const handler = require("../api/admin/kalkulacia");
    const res = fakeRes();
    await handler({ method: "GET", url: "/api/admin/kalkulacia?day=2026-10-18", headers: {} }, res);
    assert.equal(res.out.code, 401);
  });
});

test("výrobok vyradený z ponuky sa vypíše, nie zamlčí", async (t) => {
  await sReceptarom(t, async ({ db, zavolaj }) => {
    db.orders.push({ id: "o1", day: "2026-10-18", status: "nova", customer_name: "Z", phone: "", email: "", note: "" });
    db.order_items.push({
      id: "oi-1", order_id: "o1", product_id: null, category_id: "zakusky",
      name_snapshot: "Veterník", sub_snapshot: "Karamelový", price_snapshot: 3, qty: 6,
    });

    const odpoved = await zavolaj("/api/admin/kalkulacia?day=2026-10-18");
    assert.deepEqual(odpoved.body.bez_receptu, ["Veterník Karamelový"]);
  });
});
