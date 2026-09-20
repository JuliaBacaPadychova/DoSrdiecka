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
    assert.deepEqual(Object.keys(o.body).sort(), ["polozky", "recepty", "suroviny", "ulozene", "vazby", "zoznamy"]);
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

// --- nákupné zoznamy ---
//
// Zoznam je samostatná vec, nie odvodenina od objednávok: suroviny sa
// kupujú vopred, keď objednávky ešte nie sú.

test("nákupný zoznam sa dá uložiť, upraviť aj zmazať", async (t) => {
  await sReceptarom(t, async ({ db, zavolaj }) => {
    const vytvorenie = await zavolaj("POST", "/api/admin/receptar?co=zoznam", {
      day: "2026-10-18",
      name: "sobota",
      items: [{ product_id: "p-choux", kusy: 12 }],
    });
    assert.equal(vytvorenie.code, 200);
    const id = vytvorenie.body.zaznam.id;
    assert.equal(db.shopping_plans.length, 1);

    const uprava = await zavolaj("PATCH", `/api/admin/receptar?co=zoznam&id=${id}`, {
      items: [{ product_id: "p-choux", kusy: 12 }, { product_id: "p-brownie", kusy: 1 }],
    });
    assert.equal(uprava.code, 200);
    assert.equal(db.shopping_plans[0].items.length, 2);

    const zmazanie = await zavolaj("DELETE", `/api/admin/receptar?co=zoznam&id=${id}`);
    assert.equal(zmazanie.code, 200);
    assert.equal(db.shopping_plans.length, 0);
  });
});

test("zoznam bez termínu sa uloží tiež", async (t) => {
  await sReceptarom(t, async ({ db, zavolaj }) => {
    const o = await zavolaj("POST", "/api/admin/receptar?co=zoznam", {
      day: "", name: "", items: [{ product_id: "p-choux", kusy: 6 }],
    });
    assert.equal(o.code, 200);
    assert.equal(db.shopping_plans[0].day, null, "prázdny termín je prázdny, nie dnešok");
  });
});

test("položky musia byť zoznam, nie čokoľvek", async (t) => {
  await sReceptarom(t, async ({ db, zavolaj }) => {
    const o = await zavolaj("POST", "/api/admin/receptar?co=zoznam", { items: "12 choux" });
    assert.equal(o.code, 400);
    assert.equal(db.shopping_plans.length, 0, "nič sa neuloží");
  });
});

test("uložené zoznamy chodia spolu s receptárom", async (t) => {
  await sReceptarom(t, async ({ zavolaj }) => {
    await zavolaj("POST", "/api/admin/receptar?co=zoznam", {
      day: "2026-10-18", items: [{ product_id: "p-choux", kusy: 12 }],
    });
    const o = await zavolaj("GET", "/api/admin/receptar");
    assert.equal(o.body.zoznamy.length, 1);
    assert.equal(o.body.zoznamy[0].day, "2026-10-18");
  });
});

test("obchod sa uloží spolu s cenou a dátumom nákupu", async (t) => {
  await sReceptarom(t, async ({ db, zavolaj }) => {
    const o = await zavolaj("PATCH", "/api/admin/receptar?co=surovina&id=i-mas", {
      pack_price: 3.19,
      price_source: "Kaufland",
    });
    assert.equal(o.code, 200);
    assert.equal(db.ingredients[0].price_source, "Kaufland");
    assert.equal(db.ingredients[0].pack_price, 3.19);
    assert.equal(db.ingredients[0].price_date, new Date().toISOString().slice(0, 10));
  });
});

test("vymazaný obchod ostane prázdny, nie null", async (t) => {
  await sReceptarom(t, async ({ db, zavolaj }) => {
    await zavolaj("PATCH", "/api/admin/receptar?co=surovina&id=i-mas", { price_source: "" });
    assert.equal(db.ingredients[0].price_source, "", "prázdny text, nie prázdna hodnota");
  });
});

// --- uložené recepty ---
//
// Skratka k rozpisu: príchuť a počet kusov pod menom. Ukladá sa výber,
// nie vypočítané gramáže — po úprave receptu musí vyjsť nové číslo.

test("uložený recept sa dá založiť, premenovať aj zmazať", async (t) => {
  await sReceptarom(t, async ({ db, zavolaj }) => {
    const vytvorenie = await zavolaj("POST", "/api/admin/receptar?co=ulozene", {
      name: "Sobotné choux", product_id: "p-choux", pieces: 20,
    });
    assert.equal(vytvorenie.code, 200);
    const id = vytvorenie.body.zaznam.id;
    assert.equal(db.recipe_presets[0].pieces, 20);

    const uprava = await zavolaj("PATCH", `/api/admin/receptar?co=ulozene&id=${id}`,
      { name: "Choux na sobotu" });
    assert.equal(uprava.code, 200);
    assert.equal(db.recipe_presets[0].name, "Choux na sobotu");
    assert.equal(db.recipe_presets[0].product_id, "p-choux", "premenovanie nemení výber");

    const zmazanie = await zavolaj("DELETE", `/api/admin/receptar?co=ulozene&id=${id}`);
    assert.equal(zmazanie.code, 200);
    assert.equal(db.recipe_presets.length, 0);
  });
});

test("uložený recept bez príchuti sa neuloží", async (t) => {
  await sReceptarom(t, async ({ db, zavolaj }) => {
    const o = await zavolaj("POST", "/api/admin/receptar?co=ulozene", { name: "x", pieces: 6 });
    assert.equal(o.code, 400);
    assert.equal(db.recipe_presets.length, 0);
  });
});

test("nula ani text ako počet kusov neprejde", async (t) => {
  await sReceptarom(t, async ({ db, zavolaj }) => {
    for (const pieces of [0, -3, "dvanásť", 2.5]) {
      const o = await zavolaj("POST", "/api/admin/receptar?co=ulozene",
        { name: "x", product_id: "p-choux", pieces });
      assert.equal(o.code, 400, `${pieces} sa nesmie uložiť`);
    }
    assert.equal(db.recipe_presets.length, 0);
  });
});

test("uložené recepty chodia spolu s receptárom", async (t) => {
  await sReceptarom(t, async ({ zavolaj }) => {
    await zavolaj("POST", "/api/admin/receptar?co=ulozene", {
      name: "Veterníky", product_id: "p-choux", pieces: 12,
    });
    const o = await zavolaj("GET", "/api/admin/receptar");
    assert.equal(o.body.ulozene.length, 1);
    assert.equal(o.body.ulozene[0].pieces, 12);
  });
});

// Migrácia sa spúšťa ručne v Supabase. Kým nebehala, tabuľka neexistuje
// — a recepty ani ceny na nej nestoja, takže záložka musí fungovať ďalej.
test("chýbajúca tabuľka uložených nezhodí celý receptár", async (t) => {
  await sReceptarom(t, async ({ db, zavolaj }) => {
    delete db.recipe_presets;
    const o = await zavolaj("GET", "/api/admin/receptar");
    assert.equal(o.code, 200);
    assert.equal(o.body.ulozene, null, "null znamená 'tabuľka tu ešte nie je'");
    assert.equal(o.body.suroviny[0].name, "Mascarpone");
  });
});

// Druh receptu (krém / vklad / …) sa už neeviduje — políčko je preč
// zo správy aj stĺpec z databázy. Keby sa do zoznamu upraviteľných polí
// vrátil, zápis by na stĺpec, ktorý neexistuje, spadol až v Supabase.
test("druh receptu sa cez správu zapísať nedá", async (t) => {
  await sReceptarom(t, async ({ db, zavolaj }) => {
    const o = await zavolaj("POST", "/api/admin/receptar?co=recept",
      { name: "Malinový curd", yield_qty: 300, yield_unit: "g", kind: "vklad" });
    assert.equal(o.code, 200);
    assert.equal(db.recipes[0].name, "Malinový curd");
    assert.equal(db.recipes[0].kind, undefined, "druh sa z tela požiadavky zahodí");
  });
});

test("popis výťažnosti sa dá uložiť aj vymazať", async (t) => {
  await sReceptarom(t, async ({ db, zavolaj }) => {
    db.recipes.push({ id: "r-krem", name: "Vanilkový krém",
      yield_qty: 10, yield_unit: "ks", yield_label: "", steps: "", note: "", active: true });

    const o = await zavolaj("PATCH", "/api/admin/receptar?co=recept&id=r-krem",
      { yield_label: "veterníkov" });
    assert.equal(o.code, 200);
    assert.equal(db.recipes[0].yield_label, "veterníkov");

    await zavolaj("PATCH", "/api/admin/receptar?co=recept&id=r-krem", { yield_label: "" });
    assert.equal(db.recipes[0].yield_label, "", "prázdny popis je prázdny text, nie prázdna hodnota");
  });
});

// --- peniaze za obdobie ---

test("prehľad peňazí zoberie objednávky aj zoznamy z obdobia", async (t) => {
  await sReceptarom(t, async ({ db, zavolaj }) => {
    db.orders.push(
      { id: "o1", order_no: 1, day: "2026-09-10", customer_name: "Zuzka", phone: "", email: "",
        note: "", status: "vybavena", total_estimate: 18, paid_amount: 19, paid_on: "2026-09-10", paid_note: "" },
      { id: "o2", order_no: 2, day: "2026-09-11", customer_name: "Eva", phone: "", email: "",
        note: "", status: "nova", total_estimate: 12, paid_amount: null, paid_on: null, paid_note: "" },
      // Mimo obdobia — do súčtu nesmie.
      { id: "o3", order_no: 3, day: "2026-10-02", customer_name: "Iva", phone: "", email: "",
        note: "", status: "nova", total_estimate: 99, paid_amount: 99, paid_on: null, paid_note: "" },
    );

    const o = await zavolaj("GET", "/api/admin/receptar?od=2026-09-01&do=2026-09-30");
    assert.equal(o.code, 200);
    assert.equal(o.body.objednavok, 2, "októbrová objednávka sa neráta");
    assert.equal(o.body.objednane, 30);
    assert.equal(o.body.prijate, 19);
    assert.equal(o.body.nezaplatene.length, 1);
    assert.equal(o.body.nezaplatene[0].zakaznik, "Eva");
  });
});

test("obdobie musí byť dátum a nesmie ísť pozadu", async (t) => {
  await sReceptarom(t, async ({ zavolaj }) => {
    assert.equal((await zavolaj("GET", "/api/admin/receptar?od=vlani&do=2026-09-30")).code, 400);
    assert.equal((await zavolaj("GET", "/api/admin/receptar?od=2026-09-01")).code, 400);
    assert.equal((await zavolaj("GET", "/api/admin/receptar?od=2026-09-30&do=2026-09-01")).code, 400);
  });
});

test("nákupný zoznam bez termínu sa do obdobia neráta, ale je o ňom vidieť", async (t) => {
  await sReceptarom(t, async ({ db, zavolaj }) => {
    db.shopping_plans.push(
      { id: "z1", day: "2026-09-12", name: "sobota", note: "", items: [], created_at: "" },
      { id: "z2", day: null, name: "bez termínu", note: "", items: [], created_at: "" },
    );
    const o = await zavolaj("GET", "/api/admin/receptar?od=2026-09-01&do=2026-09-30");
    assert.equal(o.body.zoznamy.length, 1);
    assert.equal(o.body.bez_terminu, 1);
  });
});

test("poznámka k uloženému receptu sa uloží a chodí s ním", async (t) => {
  await sReceptarom(t, async ({ db, zavolaj }) => {
    const vytvorenie = await zavolaj("POST", "/api/admin/receptar?co=ulozene", {
      name: "Sobota choux", product_id: "p-choux", pieces: 20,
      note: "na 20 ks robím dvojitú dávku craquelinu",
    });
    assert.equal(vytvorenie.code, 200);
    assert.equal(db.recipe_presets[0].note, "na 20 ks robím dvojitú dávku craquelinu");

    const o = await zavolaj("GET", "/api/admin/receptar");
    assert.equal(o.body.ulozene[0].note, "na 20 ks robím dvojitú dávku craquelinu");

    const uprava = await zavolaj(
      "PATCH", `/api/admin/receptar?co=ulozene&id=${vytvorenie.body.zaznam.id}`,
      { note: "" });
    assert.equal(uprava.code, 200);
    assert.equal(db.recipe_presets[0].note, "", "vymazaná poznámka je prázdny text");
    assert.equal(db.recipe_presets[0].pieces, 20, "poznámka nemení výber");
  });
});
