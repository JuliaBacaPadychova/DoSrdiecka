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
  assert.equal(sent.length, 2);

  const [interny, zakaznicky] = sent;
  for (const sprava of [interny, zakaznicky]) {
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
