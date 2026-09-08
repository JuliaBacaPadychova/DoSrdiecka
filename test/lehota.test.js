// Testy na lehotu "objednať niekoľko dní vopred".
//
// Pravidlo musí platiť na serveri, nielen v kalendári: kalendár je len
// to, čo vidno v prehliadači, a dá sa obísť. Zároveň nemá zmysel ponúkať
// ako najbližší termín deň, na ktorý sa aj tak nedá objednať.

const test = require("node:test");
const assert = require("node:assert/strict");

const { startFakeSupabase } = require("./fake-supabase");

const mailer = require("../lib/mailer");
const sent = [];
mailer.sendMail = async (msg) => { sent.push(msg); };

// Dnešok v našom čase — rovnako, ako ho počíta server aj databáza.
function dnes() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bratislava" })
    .format(new Date());
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
    setHeader() { return this; },
    end(text) { out.body = text ? JSON.parse(text) : null; },
  };
}

async function sDnami(dni, fn, lead) {
  const fake = await startFakeSupabase();
  dni.forEach((d) => fake.db.open_days.push(d));
  if (lead !== undefined) fake.db.site_settings[0].lead_days = lead;
  process.env.SUPABASE_URL = fake.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fake";
  process.env.SMTP_USER = "kolacik@dosrdiecka.sk";
  try {
    await fn(fake);
  } finally {
    await fake.close();
  }
}

function otvoreny(day) {
  return { day, is_open: true, cap_zakusky: 18, cap_torty: 1, cap_chlebik: 1 };
}

async function kalendar() {
  const handler = require("../api/days");
  const now = new Date();
  const res = fakeRes();
  await handler(
    { method: "GET", url: `/api/days?year=${now.getFullYear()}&month=${now.getMonth() + 1}`, headers: {} },
    res
  );
  return res.out.body;
}

async function objednaj(day) {
  const handler = require("../api/orders");
  const res = fakeRes();
  sent.length = 0;
  await handler({
    method: "POST", url: "/api/orders", headers: {},
    body: {
      day, name: "Jana", phone: "0900123456", email: "jana@example.sk",
      note: "bez orechov", items: [{ product_id: "p-choux", qty: 6 }],
    },
  }, res);
  return res.out;
}

test("na deň v lehote sa objednávka neprijme, hoci je otvorený", async () => {
  await sDnami([otvoreny(den(3))], async () => {
    const out = await objednaj(den(3));
    assert.equal(out.code, 409);
    assert.equal(out.body.error, "too_soon");
    assert.match(out.body.message, /neskoro/i, "hláška má povedať, čo sa stalo");
    assert.equal(sent.length, 0, "za neprijatú objednávku sa neposiela nič");
  });
});

test("štvrtý deň je hranica a už prejde", async () => {
  await sDnami([otvoreny(den(4))], async () => {
    const out = await objednaj(den(4));
    assert.equal(out.code, 200,
      "keď je dnes pondelok, piatok musí prejsť");
  });
});

test("objednávka na deň v minulosti neprejde ani cez server", async () => {
  await sDnami([otvoreny(den(-1))], async () => {
    const out = await objednaj(den(-1));
    assert.equal(out.code, 409);
    assert.equal(out.body.error, "too_soon");
  });
});

test("najbližší voľný termín preskočí dni, na ktoré je už neskoro", async () => {
  await sDnami([otvoreny(den(1)), otvoreny(den(2)), otvoreny(den(6))], async () => {
    const data = await kalendar();
    assert.equal(data.next_free, den(6),
      "termín, na ktorý sa nedá objednať, nemá zmysel ponúkať");
  });
});

test("kalendár povie, od ktorého dňa sa dá objednať", async () => {
  await sDnami([otvoreny(den(6))], async () => {
    const data = await kalendar();
    assert.equal(data.earliest, den(4), "štyri dni od dneška");
    assert.equal(data.lead_days, 4);
  });
});

test("keď si majiteľka nastaví sedem dní, platí sedem", async () => {
  await sDnami([otvoreny(den(5)), otvoreny(den(8))], async () => {
    const data = await kalendar();
    assert.equal(data.earliest, den(7));
    assert.equal(data.next_free, den(8), "päťdňový termín už nestačí");

    const prilisSkoro = await objednaj(den(5));
    assert.equal(prilisSkoro.body.error, "too_soon");
    assert.equal((await objednaj(den(8))).code, 200);
  }, 7);
});

test("pri nule sa dá objednať aj na zajtra", async () => {
  await sDnami([otvoreny(den(1))], async () => {
    const data = await kalendar();
    assert.equal(data.earliest, den(0));
    assert.equal(data.lead_days, 0);
    assert.equal((await objednaj(den(1))).code, 200);
  }, 0);
});

test("dnešok sa počíta v našom čase, nie vo svetovom", async () => {
  // O pol jednej v noci u nás je vo svete ešte predchádzajúci deň. Keby
  // server rátal vo svetovom čase, ponúkol by termín o deň skorší.
  const nasDatum = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bratislava" })
    .format(new Date("2026-09-08T22:30:00Z"));
  const svetovyDatum = new Date("2026-09-08T22:30:00Z").toISOString().slice(0, 10);
  assert.equal(nasDatum, "2026-09-09");
  assert.equal(svetovyDatum, "2026-09-08");

  await sDnami([otvoreny(den(6))], async () => {
    const data = await kalendar();
    assert.equal(data.earliest, den(4),
      "earliest musí vychádzať z nášho dneška");
  });
});
