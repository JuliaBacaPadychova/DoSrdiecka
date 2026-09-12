// Testy na objednávku zapísanú ručne v správe webu.
//
// Dohodla sa mimo web, tak obchádza lehotu na objednanie aj minimálny
// odber. Kapacitu dňa obchádzať NESMIE — inak by si majiteľka deň
// prebookovala a nevšimla si to.

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

  sent.length = 0;
  const zapis = async (body) => {
    const res = fakeRes();
    await handler({
      method: "POST", url: "/api/admin/orders",
      headers: { authorization: `Bearer ${relacia.access_token}` },
      body,
    }, res);
    return res.out;
  };
  await fn({ fake, zapis });
}

function otvoreny(day, capZ = 18) {
  return { day, is_open: true, cap_zakusky: capZ, cap_torty: 1, cap_chlebik: 1 };
}
const zaklad = { name: "Jana od susedov", phone: "0900123456", note: "dohodnuté telefonicky" };

test("objednávku na zajtra zapíše, hoci web by ju neprijal", async (t) => {
  await sSpravou(t, [otvoreny(den(1))], async ({ fake, zapis }) => {
    const out = await zapis({
      ...zaklad, day: den(1), items: [{ product_id: "p-choux", qty: 6 }],
    });
    assert.equal(out.code, 200, "lehota 4 dní sa tu neuplatňuje");
    assert.ok(out.body.order_no);
    assert.equal(fake.db.orders.length, 1);
    assert.equal(fake.db.orders[0].customer_name, "Jana od susedov");
  });
});

test("prejde aj počet pod minimálnym odberom", async (t) => {
  await sSpravou(t, [otvoreny(den(9))], async ({ fake, zapis }) => {
    const out = await zapis({ ...zaklad, day: den(9), items: [{ product_id: "p-choux", qty: 2 }] });
    assert.equal(out.code, 200, "majiteľka si sama rozhodne, čo upečie");
    assert.equal(fake.db.order_items[0].qty, 2);
  });
});

test("kapacitu dňa ale obísť nemôže", async (t) => {
  await sSpravou(t, [otvoreny(den(9), 6)], async ({ fake, zapis }) => {
    const out = await zapis({ ...zaklad, day: den(9), items: [{ product_id: "p-choux", qty: 7 }] });
    assert.equal(out.code, 409);
    assert.equal(out.body.error, "capacity_zakusky");
    assert.match(out.body.message, /Dni a limity/, "hláška má povedať, čo s tým");
    assert.equal(fake.db.orders.length, 0);
  });
});

test("ručná objednávka zaberie kapacitu rovnako ako objednávka z webu", async (t) => {
  await sSpravou(t, [otvoreny(den(9), 12)], async ({ fake, zapis }) => {
    await zapis({ ...zaklad, day: den(9), items: [{ product_id: "p-choux", qty: 6 }] });
    const druha = await zapis({ ...zaklad, day: den(9), items: [{ product_id: "p-choux", qty: 7 }] });
    assert.equal(druha.code, 409, "zostávalo 6, žiadame 7");
    assert.equal(fake.db.orders.length, 1);
  });
});

test("na deň, ktorý nie je otvorený, sa zapísať nedá", async (t) => {
  await sSpravou(t, [], async ({ zapis }) => {
    const out = await zapis({ ...zaklad, day: den(9), items: [{ product_id: "p-choux", qty: 6 }] });
    assert.equal(out.code, 409);
    assert.equal(out.body.error, "day_closed");
    assert.match(out.body.message, /Dni a limity/);
  });
});

test("zákazníčke neodíde žiadny e-mail", async (t) => {
  await sSpravou(t, [otvoreny(den(9))], async ({ zapis }) => {
    await zapis({
      ...zaklad, day: den(9), email: "jana@example.sk",
      items: [{ product_id: "p-choux", qty: 6 }],
    });
    assert.equal(sent.length, 0, "majiteľka si objednávku práve s ňou dohodla");
  });
});

test("e-mail nie je povinný, meno a termín áno", async (t) => {
  await sSpravou(t, [otvoreny(den(9))], async ({ fake, zapis }) => {
    const bezMailu = await zapis({ ...zaklad, day: den(9), items: [{ product_id: "p-choux", qty: 6 }] });
    assert.equal(bezMailu.code, 200);
    assert.equal(fake.db.orders[0].email, "");

    assert.equal((await zapis({ ...zaklad, day: "", items: [{ product_id: "p-choux", qty: 6 }] })).code, 400);
    assert.equal((await zapis({ ...zaklad, name: "", day: den(9), items: [{ product_id: "p-choux", qty: 6 }] })).code, 400);
    assert.equal((await zapis({ ...zaklad, day: den(9), items: [] })).code, 400);
    assert.equal(fake.db.orders.length, 1, "nič ďalšie sa nemalo uložiť");
  });
});

test("bez prihlásenia sa objednávka zapísať nedá", async (t) => {
  await sSpravou(t, [otvoreny(den(9))], async ({ fake }) => {
    const handler = require("../api/admin/orders");
    const res = fakeRes();
    await handler({
      method: "POST", url: "/api/admin/orders", headers: {},
      body: { ...zaklad, day: den(9), items: [{ product_id: "p-choux", qty: 6 }] },
    }, res);
    assert.equal(res.out.code, 401);
    assert.equal(fake.db.orders.length, 0);
  });
});
