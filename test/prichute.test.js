// Testy na príchute pri jednom výrobku (veterník karamelový a
// pistáciovo-malinový).
//
// Najdôležitejšie pravidlo: minimálny odber platí pri každej príchuti
// zvlášť. Objednávka na 3 karamelové a 3 pistáciové sa teda musí
// odmietnuť, hoci spolu je to 6 kusov. Kontrola musí sedieť na serveri —
// vo formulári sa dá obísť.

const test = require("node:test");
const assert = require("node:assert/strict");

const { startFakeSupabase } = require("./fake-supabase");

const mailer = require("../lib/mailer");
const sent = [];
mailer.sendMail = async (msg) => { sent.push(msg); };

function iso(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function fakeRes() {
  const out = {};
  return {
    out,
    status(code) { out.code = code; return this; },
    setHeader() { return this; },
    end(text) { out.body = text ? JSON.parse(text) : null; },
  };
}

// Pripraví deň, obe príchute veterníka a vráti funkciu na objednanie.
async function sVeternikom(t, { capZakusky = 18 } = {}) {
  const fake = await startFakeSupabase();
  const day = iso(21);
  fake.db.open_days.push({
    day, is_open: true, cap_zakusky: capZakusky, cap_torty: 1, cap_chlebik: 1,
  });
  fake.db.products.push(
    {
      id: "p-vet-kar", category_id: "zakusky", name: "Veterník", sub: "Karamelový",
      description: "", alt_text: "", price: 3, min_qty: 6, min_label: "min. 6 ks",
      allergens: "1, 3, 6, 7, 8", image_url: "/assets/img/veternik.jpg",
      active: true, sort_order: 4,
    },
    {
      id: "p-vet-pis", category_id: "zakusky", name: "Veterník", sub: "Pistáciovo-malinový",
      description: "", alt_text: "", price: 3, min_qty: 6, min_label: "min. 6 ks",
      allergens: "1, 3, 6, 7, 8", image_url: "/assets/img/veternik.jpg",
      active: true, sort_order: 5,
    }
  );

  process.env.SUPABASE_URL = fake.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fake";
  process.env.SMTP_USER = "kolacik@dosrdiecka.sk";
  const handler = require("../api/orders");
  t.after(async () => { await fake.close(); });

  sent.length = 0;
  return {
    fake,
    day,
    async objednaj(items) {
      const res = fakeRes();
      await handler({
        method: "POST", url: "/api/orders", headers: {},
        body: {
          day, name: "Jana Nováková", phone: "0900123456",
          email: "jana@example.sk", note: "bez orechov", items,
        },
      }, res);
      return res.out;
    },
  };
}

test("3 karamelové + 3 pistáciové sa NEPRIJMÚ — minimum platí pri každej príchuti", async (t) => {
  const { objednaj } = await sVeternikom(t);

  const out = await objednaj([
    { product_id: "p-vet-kar", qty: 3 },
    { product_id: "p-vet-pis", qty: 3 },
  ]);

  assert.equal(out.code, 409, "spolu 6 kusov nestačí, keď ani jedna príchuť nemá 6");
  assert.equal(out.body.error, "below_minimum");
  assert.match(out.body.message, /príchut/i, "hláška má povedať, prečo to neprešlo");
  assert.equal(sent.length, 0, "za odmietnutú objednávku sa neposiela nič");
});

test("6 z jednej a 6 z druhej príchute prejde a v e-mailoch sú obe", async (t) => {
  const { objednaj } = await sVeternikom(t);

  const out = await objednaj([
    { product_id: "p-vet-kar", qty: 6 },
    { product_id: "p-vet-pis", qty: 6 },
  ]);

  assert.equal(out.code, 200);
  assert.equal(out.body.total, 36, "12 kusov po 3 €");
  assert.equal(sent.length, 3);

  const [interny, zakaznicky, kopia] = sent;
  for (const sprava of [interny, zakaznicky, kopia]) {
    assert.match(sprava.text, /6x Veterník \(Karamelový\)/);
    assert.match(sprava.text, /6x Veterník \(Pistáciovo-malinový\)/);
  }
});

test("jedna príchuť sama o sebe stačí, keď má svojich 6 kusov", async (t) => {
  const { objednaj } = await sVeternikom(t);

  const out = await objednaj([{ product_id: "p-vet-pis", qty: 6 }]);
  assert.equal(out.code, 200, "nikto nemusí brať obe príchute");
});

test("príchute sa počítajú do spoločného denného limitu zákuskov", async (t) => {
  // Na deň sa zmestí 10 zákuskov: 6 + 6 je 12, čiže o dva veľa.
  const { objednaj } = await sVeternikom(t, { capZakusky: 10 });

  const out = await objednaj([
    { product_id: "p-vet-kar", qty: 6 },
    { product_id: "p-vet-pis", qty: 6 },
  ]);

  assert.equal(out.code, 409);
  assert.equal(out.body.error, "capacity_zakusky",
    "limit je na zákusky ako celok, nie na každú príchuť zvlášť");
  assert.equal(sent.length, 0);
});

test("príchuť sa v ponuke tvári ako obyčajný výrobok — /api/menu ich vráti obe", async (t) => {
  const { fake } = await sVeternikom(t);
  const menu = require("../api/menu");
  const res = fakeRes();
  await menu({ method: "GET", url: "/api/menu", headers: {} }, res);

  const veterniky = res.out.body.products.filter((p) => p.name === "Veterník");
  assert.equal(veterniky.length, 2, "web si ich do jednej karty zoskupí sám");
  assert.deepEqual(
    veterniky.map((p) => p.sub).sort(),
    ["Karamelový", "Pistáciovo-malinový"]
  );
  assert.ok(fake);
});

// --- možnosť "podľa želania" -----------------------------------------
//
// Tretia možnosť pri Choux nemá vyplnené alergény: zloženie sa dohodne
// až z poznámky, ktorú zákazníčka k objednávke musí napísať. Inak je to
// úplne obyčajná príchuť — rovnaká cena aj rovnaké minimum.

async function sChoux(t) {
  const fake = await startFakeSupabase();
  const day = iso(23);
  fake.db.open_days.push({ day, is_open: true, cap_zakusky: 18, cap_torty: 1, cap_chlebik: 1 });
  fake.db.products.push({
    id: "p-choux-zelanie", category_id: "zakusky", name: "Choux",
    sub: "Chcem inú kombináciu chutí",
    description: "Vyber si počet kusov a napíš mi predstavu do poznámky.",
    alt_text: "", price: 3, min_qty: 6, min_label: "min. 6 ks",
    allergens: "", image_url: "/assets/img/choux.jpg", active: true, sort_order: 3,
  });

  process.env.SUPABASE_URL = fake.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fake";
  process.env.SMTP_USER = "kolacik@dosrdiecka.sk";
  const handler = require("../api/orders");
  t.after(async () => { await fake.close(); });

  sent.length = 0;
  return async function objednaj(items, note) {
    const res = fakeRes();
    await handler({
      method: "POST", url: "/api/orders", headers: {},
      body: {
        day, name: "Jana Nováková", phone: "0900123456",
        email: "jana@example.sk", note, items,
      },
    }, res);
    return res.out;
  };
}

test("objednávka na želanie prejde a jej predstava je v oboch e-mailoch", async (t) => {
  const objednaj = await sChoux(t);

  const out = await objednaj(
    [{ product_id: "p-choux-zelanie", qty: 6 }],
    "Slaný karamel a vanilka prosím, bez orechov."
  );

  assert.equal(out.code, 200);
  assert.equal(sent.length, 3);
  const [interny, zakaznicky, kopia] = sent;
  assert.match(interny.text, /6x Choux \(Chcem inú kombináciu chutí\)/,
    "majiteľka musí vidieť, že ide o objednávku na želanie");
  assert.match(interny.text, /Slaný karamel a vanilka/,
    "bez poznámky by nevedela, čo má upiecť");
  assert.match(zakaznicky.text, /Slaný karamel a vanilka/,
    "zákazníčka si má prečítať, čo si vlastne vypýtala");
  assert.equal(kopia.text, zakaznicky.text, "kópia je tá istá správa");
});

test("na želanie platí rovnaké minimum ako pri ostatných príchutiach", async (t) => {
  const objednaj = await sChoux(t);

  const out = await objednaj([{ product_id: "p-choux-zelanie", qty: 3 }], "hocičo sladké");
  assert.equal(out.code, 409);
  assert.equal(out.body.error, "below_minimum");
  assert.equal(sent.length, 0);
});

test("bez poznámky sa objednávka na želanie neodošle", async (t) => {
  const objednaj = await sChoux(t);

  const out = await objednaj([{ product_id: "p-choux-zelanie", qty: 6 }], "   ");
  assert.equal(out.code, 400);
  assert.equal(out.body.error, "missing_note",
    "pri tejto možnosti je poznámka jediné, z čoho sa dá upiecť");
  assert.equal(sent.length, 0);
});

// --- "od" pri cene ---------------------------------------------------
//
// Cena zákuskov a chlebíka je za kus a platí, tak sa píše bez "od".
// Pri torte sa veľkosť aj úpravy ešte dolaďujú, tak "od" ostáva.

async function sTortou(t) {
  const fake = await startFakeSupabase();
  const day = iso(25);
  fake.db.open_days.push({ day, is_open: true, cap_zakusky: 18, cap_torty: 1, cap_chlebik: 1 });

  process.env.SUPABASE_URL = fake.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fake";
  process.env.SMTP_USER = "kolacik@dosrdiecka.sk";
  const handler = require("../api/orders");
  t.after(async () => { await fake.close(); });

  sent.length = 0;
  return async function objednaj(items) {
    const res = fakeRes();
    await handler({
      method: "POST", url: "/api/orders", headers: {},
      body: {
        day, name: "Jana", phone: "0900123456",
        email: "jana@example.sk", note: "bez orechov", items,
      },
    }, res);
    return res.out;
  };
}

test("pri samotných zákuskoch je cena v e-mailoch bez „od“", async (t) => {
  const objednaj = await sTortou(t);

  const out = await objednaj([{ product_id: "p-choux", qty: 6 }]);
  assert.equal(out.code, 200);
  assert.equal(out.body.total, 18);

  for (const sprava of sent) {
    assert.match(sprava.text, /Orientačná cena: 18 €/);
    assert.doesNotMatch(sprava.text, /od 18 €/, "cena za kus platí, netreba „od“");
  }
});

test("keď je v objednávke torta, „od“ pri cene ostáva", async (t) => {
  const objednaj = await sTortou(t);

  const out = await objednaj([
    { product_id: "p-brownie", qty: 1 },
    { product_id: "p-choux", qty: 6 },
  ]);
  assert.equal(out.code, 200);
  assert.equal(out.body.total, 58);

  for (const sprava of sent) {
    assert.match(sprava.text, /Orientačná cena: od 58 €/,
      "veľkosť aj úpravy torty sa ešte dolaďujú");
  }
});
