// Testy na objednávku zapísanú ručne v správe webu.
//
// Dohodla sa mimo web, tak obchádza lehotu na objednanie, minimálny
// odber aj limit dňa — a z limitu na webe ani neuberá. Limit hovorí,
// koľko si majiteľka necháva na verejné objednávanie, nie koľko celkovo
// upečie; o dohode spred pultu rozhodla sama.
//
// Web musí ostať obmedzený, inak by cez neho prišla objednávka, ktorá
// sa už neupečie.

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

// Limit dňa hovorí, koľko si majiteľka necháva na verejné objednávanie —
// nie koľko celkovo upečie. Keď sa dohodne osobne, rozhodla o tom sama.

test("limit dňa ju nezastaví — zapíše sa aj do plného dňa", async (t) => {
  await sSpravou(t, [otvoreny(den(9), 6)], async ({ fake, zapis }) => {
    const out = await zapis({ ...zaklad, day: den(9), items: [{ product_id: "p-choux", qty: 7 }] });
    assert.equal(out.code, 200, "limit je na web, nie na dohodu spred pultu");
    assert.equal(fake.db.orders.length, 1);
    assert.equal(fake.db.orders[0].manual, true, "zapíše sa ako dohodnutá mimo web");
  });
});

test("ručná objednávka miesto zaberie a je pri nej vidieť, že je spoza webu", async (t) => {
  await sSpravou(t, [otvoreny(den(9), 12)], async ({ fake, zapis }) => {
    await zapis({ ...zaklad, day: den(9), items: [{ product_id: "p-choux", qty: 7 }] });
    const stav = await fetch(`${process.env.SUPABASE_URL}/rest/v1/day_capacity?day=eq.${den(9)}`)
      .then((r) => r.json());
    assert.equal(stav[0].remaining_zakusky, 5, "z limitu 12 ubudlo sedem kusov");
    assert.equal(stav[0].mimo_webu_zakusky, 7, "a je vidieť, že sú dohodnuté mimo web");
    assert.equal(fake.db.orders.length, 1);
  });
});

test("termín, ktorý v kalendári ešte nie je, si zapíše sám — ako zatvorený", async (t) => {
  await sSpravou(t, [], async ({ fake, zapis }) => {
    const out = await zapis({ ...zaklad, day: den(9), items: [{ product_id: "p-choux", qty: 6 }] });
    assert.equal(out.code, 200);
    assert.equal(out.body.day_created, true, "správa webu to má povedať");

    const novy = fake.db.open_days.find((d) => d.day === den(9));
    assert.ok(novy, "deň musí v kalendári pribudnúť");
    assert.equal(novy.is_open, false,
      "na webe sa taký deň ponúkať nemá — dohodla sa osobne");
  });
});

test("na deň pridaný takto sa z webu objednať nedá", async (t) => {
  await sSpravou(t, [], async ({ zapis }) => {
    await zapis({ ...zaklad, day: den(9), items: [{ product_id: "p-choux", qty: 6 }] });

    // Objednávka z webu ide cez /api/orders, ktoré p_rucne neposiela.
    const verejny = require("../api/orders");
    const res = fakeRes();
    await verejny({
      method: "POST", url: "/api/orders", headers: {},
      body: {
        day: den(9), name: "Cudzia", phone: "0900123456",
        email: "c@example.sk", note: "bez orechov",
        items: [{ product_id: "p-choux", qty: 6 }],
      },
    }, res);
    assert.equal(res.out.code, 409);
    assert.equal(res.out.body.error, "day_closed");
  });
});

test("na existujúci zatvorený deň sa zapísať dá a deň ostane zatvorený", async (t) => {
  const zatvoreny = { day: den(9), is_open: false, cap_zakusky: 18, cap_torty: 1, cap_chlebik: 1 };
  await sSpravou(t, [zatvoreny], async ({ fake, zapis }) => {
    const out = await zapis({ ...zaklad, day: den(9), items: [{ product_id: "p-choux", qty: 6 }] });
    assert.equal(out.code, 200);
    assert.equal(out.body.day_created, false, "deň už existoval");
    assert.equal(fake.db.open_days.find((d) => d.day === den(9)).is_open, false);
  });
});

test("na dni, ktorý si zápis založil, limit tiež neplatí", async (t) => {
  await sSpravou(t, [], async ({ fake, zapis }) => {
    // Nový deň dostane predvolené limity: 18 zákuskov, 1 torta, 1 chlebík.
    await zapis({ ...zaklad, day: den(9), items: [{ product_id: "p-choux", qty: 12 }] });
    const dalsia = await zapis({ ...zaklad, day: den(9), items: [{ product_id: "p-choux", qty: 12 }] });
    assert.equal(dalsia.code, 200, "24 kusov na deň s limitom 18 — je to jej rozhodnutie");
    assert.equal(fake.db.orders.length, 2);
  });
});

// Druhá polovica dohody: limit ručnej objednávke nebráni, ale miesto
// zaberá. Za deň sa upečie to isté, nech si to objedná ktokoľvek —
// keby ručná objednávka miesto nezabrala, web by pustil tortu na deň,
// na ktorý je už jedna sľúbená osobne.
test("ručná objednávka zaberie miesto aj webu", async (t) => {
  await sSpravou(t, [otvoreny(den(9), 6)], async ({ fake, zapis }) => {
    await zapis({ ...zaklad, day: den(9), items: [{ product_id: "p-choux", qty: 6 }] });

    const objednavky = require("../api/orders");
    const res = fakeRes();
    await objednavky({
      method: "POST", url: "/api/orders", headers: {},
      body: { day: den(9), name: "Web", phone: "0900000000", email: "a@b.sk",
              note: "bez orechov", items: [{ product_id: "p-choux", qty: 6 }] },
    }, res);
    assert.equal(res.out.code, 409, "limit 6 je ručnou objednávkou minutý");
    assert.equal(fake.db.orders.filter((o) => !o.manual).length, 0,
      "cez web neprešlo nič");
  });
});

// Deň s ručnou objednávkou sa na webe nesmie ponúkať ako voľný. Presne
// toto sa stalo v praxi: na 12.12. bola dohodnutá torta mimo webu a web
// na ten istý deň ďalej ponúkal tortu.
// Deň, na ktorom je torta dohodnutá mimo webu, už tortu ponúkať nesmie.
// Presne toto sa stalo v praxi: na 12.12. bola torta dohodnutá osobne
// a web na ten istý deň ďalej ponúkal tortu.
test("tortu dohodnutú mimo web už web na ten deň neponúkne", async (t) => {
  // Deň len na tortu: zákusky ani chlebík sa naň nepečú. Inak by deň
  // ostal voľný kvôli zákuskom a na torte by sa nič neukázalo.
  const lenTorta = { day: den(9), is_open: true, cap_zakusky: 0, cap_torty: 1, cap_chlebik: 0 };
  await sSpravou(t, [lenTorta], async ({ zapis }) => {
    const dni = require("../api/days");
    const teraz = new Date(`${den(9)}T00:00:00Z`);
    const stavDni = async () => {
      const res = fakeRes();
      await dni({
        method: "GET",
        url: `/api/days?year=${teraz.getUTCFullYear()}&month=${teraz.getUTCMonth() + 1}`,
        headers: {},
      }, res);
      return res.out.body;
    };

    const pred = await stavDni();
    assert.equal(pred.next_free, den(9), "pred dohodou web ten deň ponúka");

    await zapis({ ...zaklad, day: den(9), items: [{ product_id: "p-brownie", qty: 1 }] });

    const po = await stavDni();
    const d = po.days.find((x) => String(x.day).slice(0, 10) === den(9));
    assert.equal(d.remaining_torty, 0, "torta na ten deň je obsadená");
    assert.equal(d.mimo_webu_torty, 1, "a vidno, že je dohodnutá mimo web");
    assert.notEqual(po.next_free, den(9), "web ten deň už ako voľný neponúka");
  });
});

// Druhá strana tej istej mince: deň sa nezatvorí celý. Keď je mimo web
// dohodnutá iba torta, zákusky sa na ten deň objednať dajú ďalej.
test("ručná torta nezavrie celý deň — zákusky sa objednať dajú", async (t) => {
  await sSpravou(t, [otvoreny(den(9))], async ({ zapis }) => {
    await zapis({ ...zaklad, day: den(9), items: [{ product_id: "p-brownie", qty: 1 }] });

    const objednavky = require("../api/orders");
    const res = fakeRes();
    await objednavky({
      method: "POST", url: "/api/orders", headers: {},
      body: { day: den(9), name: "Web", phone: "0900000000", email: "a@b.sk",
              note: "bez orechov", items: [{ product_id: "p-choux", qty: 6 }] },
    }, res);
    assert.equal(res.out.code, 200, "zákusky ručná torta neblokuje");
  });
});

// Opačný smer, aby sa pravidlo neprehuplo celé: limit zapísať nezabráni.
test("limit ručnej objednávke ani tak nebráni", async (t) => {
  await sSpravou(t, [otvoreny(den(9), 6)], async ({ fake, zapis }) => {
    await zapis({ ...zaklad, day: den(9), items: [{ product_id: "p-choux", qty: 6 }] });
    const nadLimit = await zapis({
      ...zaklad, day: den(9), items: [{ product_id: "p-choux", qty: 6 }],
    });
    assert.equal(nadLimit.code, 200, "12 kusov na deň s limitom 6 — je to jej rozhodnutie");
    assert.equal(fake.db.orders.length, 2);
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

// --- zápis prijatých peňazí ---
//
// Prijatá suma je samostatný údaj, nie oprava ceny objednávky. Rozdiel
// medzi nimi je informácia (pri torte dohodnutá cena, inokedy euro navyše),
// takže sa obe musia dať prečítať naraz.

async function sPlatbou(t, fn) {
  const fake = await startFakeSupabase();
  fake.db.orders.push({
    id: "o1", order_no: 7, day: "2026-09-10", customer_name: "Zuzka", phone: "", email: "",
    note: "", status: "nova", total_estimate: 18, paid_amount: null, paid_on: null, paid_note: "",
  });
  process.env.SUPABASE_URL = fake.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fake";
  process.env.ADMIN_EMAILS = fake.adminCredentials.email;
  t.after(async () => { await fake.close(); });

  const handler = require("../api/admin/orders");
  const relacia = await authLogin(fake.adminCredentials.email, fake.adminCredentials.password);
  const uprav = async (body) => {
    const res = fakeRes();
    await handler({
      method: "PATCH", url: "/api/admin/orders?id=o1",
      headers: { authorization: `Bearer ${relacia.access_token}` },
      body,
    }, res);
    return res.out;
  };
  await fn({ db: fake.db, uprav });
}

test("prijatá suma sa uloží aj s dátumom a cena objednávky ostane", async (t) => {
  await sPlatbou(t, async ({ db, uprav }) => {
    const out = await uprav({ paid_amount: 19, paid_note: "nechala navyše" });
    assert.equal(out.code, 200);
    assert.equal(db.orders[0].paid_amount, 19);
    assert.equal(db.orders[0].paid_on, new Date().toISOString().slice(0, 10));
    assert.equal(db.orders[0].paid_note, "nechala navyše");
    assert.equal(db.orders[0].total_estimate, 18, "cena objednávky sa platbou neprepisuje");
  });
});

test("vymazaná suma znamená nezaplatené, nie nulu", async (t) => {
  await sPlatbou(t, async ({ db, uprav }) => {
    await uprav({ paid_amount: 19 });
    await uprav({ paid_amount: "" });
    assert.equal(db.orders[0].paid_amount, null);
    assert.equal(db.orders[0].paid_on, null, "dátum platby odíde spolu so sumou");
  });
});

test("zapísaná nula je platný zápis", async (t) => {
  await sPlatbou(t, async ({ db, uprav }) => {
    assert.equal((await uprav({ paid_amount: 0 })).code, 200);
    assert.equal(db.orders[0].paid_amount, 0);
  });
});

test("záporná suma ani text neprejdú", async (t) => {
  await sPlatbou(t, async ({ db, uprav }) => {
    assert.equal((await uprav({ paid_amount: -5 })).code, 400);
    assert.equal((await uprav({ paid_amount: "dvadsať" })).code, 400);
    assert.equal((await uprav({ paid_on: "vlani" })).code, 400);
    assert.equal(db.orders[0].paid_amount, null, "nič sa neuložilo");
  });
});

test("stav objednávky sa dá meniť aj naďalej, aj spolu s platbou", async (t) => {
  await sPlatbou(t, async ({ db, uprav }) => {
    assert.equal((await uprav({ status: "vybavena", paid_amount: 18 })).code, 200);
    assert.equal(db.orders[0].status, "vybavena");
    assert.equal(db.orders[0].paid_amount, 18);
    assert.equal((await uprav({ status: "hotovo" })).code, 400, "neznámy stav neprejde");
  });
});

test("prázdna úprava sa odmietne, nech sa nezapisuje naprázdno", async (t) => {
  await sPlatbou(t, async ({ uprav }) => {
    assert.equal((await uprav({})).code, 400);
  });
});
