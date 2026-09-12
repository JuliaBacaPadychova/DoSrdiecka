// Testy na správu receptára: čítanie, úpravu cien a ochranu nasadenia.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

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

async function sReceptarom(t, fn) {
  const fake = await startFakeSupabase();
  fake.db.ingredients.push({
    id: "i-mas", name: "Mascarpone", unit: "g", pack_size: 250, pack_price: 2.53,
    price_date: null, price_source: "excel Ciselnik", negligible: false, kind: "surovina", note: "",
  });
  process.env.SUPABASE_URL = fake.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fake";
  process.env.ADMIN_EMAILS = fake.adminCredentials.email;
  t.after(async () => { await fake.close(); });

  const handler = require("../api/admin/receptar");
  const relacia = await authLogin(fake.adminCredentials.email, fake.adminCredentials.password);

  const zavolaj = async (method, url, body) => {
    const res = fakeRes();
    await handler({
      method, url,
      headers: { authorization: `Bearer ${relacia.access_token}` },
      body,
    }, res);
    return res.out;
  };

  await fn({ db: fake.db, zavolaj });
}

test("čítanie vráti suroviny aj recepty naraz", async (t) => {
  await sReceptarom(t, async ({ zavolaj }) => {
    const o = await zavolaj("GET", "/api/admin/receptar");
    assert.equal(o.code, 200);
    assert.deepEqual(Object.keys(o.body).sort(), ["polozky", "recepty", "suroviny", "vazby"]);
    assert.equal(o.body.suroviny[0].name, "Mascarpone");
  });
});

test("zmena ceny si sama zapíše dátum, odkedy platí", async (t) => {
  await sReceptarom(t, async ({ db, zavolaj }) => {
    const o = await zavolaj("PATCH", "/api/admin/receptar?co=surovina&id=i-mas", { pack_price: 2.99 });
    assert.equal(o.code, 200);
    assert.equal(db.ingredients[0].pack_price, 2.99);
    assert.equal(db.ingredients[0].price_date, new Date().toISOString().slice(0, 10));
  });
});

test("zadaný dátum sa neprepíše dneškom", async (t) => {
  await sReceptarom(t, async ({ db, zavolaj }) => {
    await zavolaj("PATCH", "/api/admin/receptar?co=surovina&id=i-mas",
      { pack_price: 2.99, price_date: "2026-01-15" });
    assert.equal(db.ingredients[0].price_date, "2026-01-15");
  });
});

test("vymazané balenie je prázdne, nie nula", async (t) => {
  await sReceptarom(t, async ({ db, zavolaj }) => {
    await zavolaj("PATCH", "/api/admin/receptar?co=surovina&id=i-mas", { pack_size: "" });
    assert.equal(db.ingredients[0].pack_size, null);
  });
});

test("cudzí stĺpec sa cez formulár prepísať nedá", async (t) => {
  await sReceptarom(t, async ({ db, zavolaj }) => {
    await zavolaj("PATCH", "/api/admin/receptar?co=surovina&id=i-mas",
      { name: "Mascarpone light", id: "podvrh" });
    assert.equal(db.ingredients[0].id, "i-mas");
    assert.equal(db.ingredients[0].name, "Mascarpone light");
  });
});

test("neznámy typ záznamu sa odmietne", async (t) => {
  await sReceptarom(t, async ({ zavolaj }) => {
    const o = await zavolaj("PATCH", "/api/admin/receptar?co=cokolvek&id=1", { name: "x" });
    assert.equal(o.code, 400);
  });
});

// Vercel na bezplatnom pláne pustí najviac 12 serverless funkcií na
// nasadenie. Keď ich pribudne trinásta, nasadenie zlyhá — a zistilo by
// sa to až na živom webe. Preto to stráži test.
test("počet serverless funkcií sa zmestí do limitu nasadenia", () => {
  const koren = path.join(__dirname, "..", "api");
  const spocitaj = (dir) => fs.readdirSync(dir, { withFileTypes: true })
    .reduce((n, p) => n + (p.isDirectory()
      ? spocitaj(path.join(dir, p.name))
      : (p.name.endsWith(".js") ? 1 : 0)), 0);

  const pocet = spocitaj(koren);
  assert.ok(pocet <= 12, `api/ má ${pocet} funkcií, Vercel Hobby pustí najviac 12`);
});
