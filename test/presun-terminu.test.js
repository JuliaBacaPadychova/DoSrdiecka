// Presun objednávky na iný termín.
//
// Kapacita dňa aj prehľad v Peniazoch sa počítajú podľa dňa objednávky.
// Keď sa piekol iný deň, než na aký bola objednaná — dohodli sa inak,
// alebo to majiteľka stihla skôr — musí sa dať termín prepísať. Inak
// objednávka drží kapacitu dňa, na ktorom sa nepieklo, a v Peniazoch
// spadne do zlého obdobia.
//
// Označiť ju za vybavenú nestačí: vybavená objednávka kapacitu drží
// ďalej, a to správne — upiekla sa.

const test = require("node:test");
const assert = require("node:assert/strict");

const { startFakeSupabase } = require("./fake-supabase");
const { authLogin } = require("../lib/supabase");

const mailer = require("../lib/mailer");
const sent = [];
mailer.sendMail = async (msg) => { sent.push(msg); };

function dnes() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bratislava" }).format(new Date());
}
function den(posun) {
  const d = new Date(`${dnes()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + posun);
  return d.toISOString().slice(0, 10);
}

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

async function sSpravou(t, dni, fn) {
  const fake = await startFakeSupabase();
  dni.forEach((d) => fake.db.open_days.push(d));
  process.env.SUPABASE_URL = fake.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fake";
  process.env.ADMIN_EMAILS = fake.adminCredentials.email;
  t.after(async () => { await fake.close(); });

  const handler = require("../api/admin/orders");
  const relacia = await authLogin(fake.adminCredentials.email, fake.adminCredentials.password);
  const hlavicka = { authorization: `Bearer ${relacia.access_token}` };

  sent.length = 0;
  const zapis = async (body) => {
    const res = fakeRes();
    await handler({ method: "POST", url: "/api/admin/orders", headers: hlavicka, body }, res);
    return res.out;
  };
  const uprav = async (id, body) => {
    const res = fakeRes();
    await handler({
      method: "PATCH", url: `/api/admin/orders?id=${id}`, headers: hlavicka, body,
    }, res);
    return res.out;
  };
  await fn({ fake, zapis, uprav });
}

function otvoreny(day, capZ = 18) {
  return { day, is_open: true, cap_zakusky: capZ, cap_torty: 1, cap_chlebik: 1 };
}
const zaklad = { name: "Jana od susedov", phone: "0900123456", note: "" };

// Koľko chlebíkov/zákuskov drží daný deň. Ručné objednávky do kapacity
// nevstupujú, tak sa tu pracuje s objednávkami z webu.
function zabrate(fake, day, kategoria) {
  return fake.db.order_items
    .filter((oi) => oi.category_id === kategoria)
    .filter((oi) => {
      const o = fake.db.orders.find((x) => x.id === oi.order_id);
      return o && o.day === day && o.status !== "zrusena";
    })
    .reduce((s, oi) => s + oi.qty, 0);
}

test("presun uvoľní kapacitu pôvodného dňa a zaberie ju na novom", async (t) => {
  await sSpravou(t, [otvoreny(den(5)), otvoreny(den(-1))], async ({ fake, zapis, uprav }) => {
    const zapisana = await zapis({
      ...zaklad, day: den(5), items: [{ product_id: "p-chlebik", qty: 1 }],
    });
    assert.equal(zapisana.code, 200);
    const id = fake.db.orders[0].id;
    assert.equal(zabrate(fake, den(5), "chlebik"), 1);

    const out = await uprav(id, { day: den(-1) });
    assert.equal(out.code, 200);
    assert.equal(zabrate(fake, den(5), "chlebik"), 0, "pôvodný deň už nič nedrží");
    assert.equal(zabrate(fake, den(-1), "chlebik"), 1, "drží ho deň, kedy sa piekol");
  });
});

test("po presune patrí objednávka do obdobia nového termínu", async (t) => {
  await sSpravou(t, [otvoreny(den(5)), otvoreny(den(-1))], async ({ fake, zapis, uprav }) => {
    await zapis({ ...zaklad, day: den(5), items: [{ product_id: "p-chlebik", qty: 1 }] });
    const id = fake.db.orders[0].id;

    await uprav(id, { day: den(-1) });
    // Peniaze aj recepty vyberajú objednávky rozsahom cez orders.day.
    const vObdobi = (od, doDna) =>
      fake.db.orders.filter((o) => o.day >= od && o.day <= doDna).length;
    assert.equal(vObdobi(den(-2), den(0)), 1, "vidno ju v období, kedy sa piekla");
    assert.equal(vObdobi(den(4), den(6)), 0, "a už nie v tom pôvodnom");
  });
});

test("označiť za vybavenú kapacitu neuvoľní — to je zámer", async (t) => {
  await sSpravou(t, [otvoreny(den(5))], async ({ fake, zapis, uprav }) => {
    await zapis({ ...zaklad, day: den(5), items: [{ product_id: "p-chlebik", qty: 1 }] });
    const id = fake.db.orders[0].id;

    await uprav(id, { status: "vybavena" });
    assert.equal(zabrate(fake, den(5), "chlebik"), 1,
      "upečená objednávka kapacitu dňa naozaj minula");
  });
});

test("termín mimo kalendára sa pri presune založí ako zatvorený", async (t) => {
  await sSpravou(t, [otvoreny(den(5))], async ({ fake, zapis, uprav }) => {
    await zapis({ ...zaklad, day: den(5), items: [{ product_id: "p-chlebik", qty: 1 }] });
    const id = fake.db.orders[0].id;

    const out = await uprav(id, { day: den(-3) });
    assert.equal(out.code, 200);
    assert.equal(out.body.day_created, true, "správa webu to má povedať");
    const novy = fake.db.open_days.find((d) => d.day === den(-3));
    assert.ok(novy, "deň pribudol do kalendára");
    assert.equal(novy.is_open, false, "zatvorený — na webe sa ponúkať nemá");
  });
});

test("presun na deň, ktorý v kalendári už je, ho nepremaže", async (t) => {
  await sSpravou(t, [otvoreny(den(5)), otvoreny(den(7), 30)], async ({ fake, zapis, uprav }) => {
    await zapis({ ...zaklad, day: den(5), items: [{ product_id: "p-chlebik", qty: 1 }] });
    const id = fake.db.orders[0].id;

    const out = await uprav(id, { day: den(7) });
    assert.equal(out.body.day_created, false);
    const cielovy = fake.db.open_days.find((d) => d.day === den(7));
    assert.equal(cielovy.is_open, true, "otvorený deň ostal otvorený");
    assert.equal(cielovy.cap_zakusky, 30, "a limit sa mu neprepísal");
  });
});

test("nezmyselný dátum sa odmietne a objednávka ostane, kde bola", async (t) => {
  await sSpravou(t, [otvoreny(den(5))], async ({ fake, zapis, uprav }) => {
    await zapis({ ...zaklad, day: den(5), items: [{ product_id: "p-chlebik", qty: 1 }] });
    const id = fake.db.orders[0].id;

    const out = await uprav(id, { day: "3.10.2026" });
    assert.equal(out.code, 400);
    assert.equal(out.body.error, "invalid_day");
    assert.equal(fake.db.orders[0].day, den(5), "termín sa nezmenil");
  });
});

test("presun zákazníčke nič neposiela", async (t) => {
  await sSpravou(t, [otvoreny(den(5)), otvoreny(den(-1))], async ({ fake, zapis, uprav }) => {
    await zapis({ ...zaklad, day: den(5), email: "jana@example.sk",
      items: [{ product_id: "p-chlebik", qty: 1 }] });
    sent.length = 0;

    await uprav(fake.db.orders[0].id, { day: den(-1) });
    assert.equal(sent.length, 0, "o presune sa dohodli osobne");
  });
});

test("termín aj stav sa dajú zmeniť naraz", async (t) => {
  await sSpravou(t, [otvoreny(den(5)), otvoreny(den(-1))], async ({ fake, zapis, uprav }) => {
    await zapis({ ...zaklad, day: den(5), items: [{ product_id: "p-chlebik", qty: 1 }] });
    const id = fake.db.orders[0].id;

    const out = await uprav(id, { day: den(-1), status: "vybavena" });
    assert.equal(out.code, 200);
    assert.equal(fake.db.orders[0].day, den(-1));
    assert.equal(fake.db.orders[0].status, "vybavena");
  });
});
