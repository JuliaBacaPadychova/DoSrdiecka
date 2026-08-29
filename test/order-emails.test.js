// Testy na dve e-mailové správy po objednávke: internú pre majiteľku
// a potvrdenie pre zákazníčku. Strážia hlavne to, aby sa v nich
// objavovali názvy výrobkov (nie vnútorné identifikátory) a aby sa
// zákazníčke neposielali veci určené len pre správu webu.

const test = require("node:test");
const assert = require("node:assert/strict");

const { startFakeSupabase } = require("./fake-supabase");

// api/orders.js si sendMail odloží hneď pri načítaní, takže podvrhnúť
// sa dá len raz — správanie preto riadime cez premennú.
const mailer = require("../lib/mailer");
const sent = [];
let zlyhajPocet = 0;
mailer.sendMail = async (msg) => {
  if (zlyhajPocet > 0) { zlyhajPocet -= 1; throw new Error("SMTP: zlé heslo"); }
  sent.push(msg);
};

function iso(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function fakeRes() {
  const out = { statusCode: 0, body: null };
  return {
    out,
    status(code) { out.statusCode = code; return this; },
    setHeader() { return this; },
    end(text) { out.body = text ? JSON.parse(text) : null; },
  };
}

async function objednaj(handler, body) {
  const res = fakeRes();
  await handler({ method: "POST", url: "/api/orders", headers: {}, body }, res);
  return res.out;
}

test("po objednávke odídu dva e-maily s názvami výrobkov", async (t) => {
  const fake = await startFakeSupabase();
  const day = iso(7);
  fake.db.open_days.push({ day, is_open: true, cap_zakusky: 18, cap_torty: 1 });

  process.env.SUPABASE_URL = fake.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fake";
  process.env.SMTP_USER = "kolacik@dosrdiecka.sk";
  const handler = require("../api/orders");

  t.after(async () => { await fake.close(); });

  sent.length = 0;
  const out = await objednaj(handler, {
    day,
    name: "Jana Nováková",
    phone: "0900123456",
    email: "jana@example.sk",
    note: "malinové",
    items: [{ product_id: "p-choux", qty: 6 }],
  });

  assert.equal(out.statusCode, 200, "objednávka má prejsť");
  assert.equal(sent.length, 2, "majú odísť práve dve správy");

  const [interny, zakaznicky] = sent;

  // --- interná správa pre majiteľku ---
  assert.equal(interny.to, "kolacik@dosrdiecka.sk");
  assert.equal(interny.replyTo, "jana@example.sk", "odpoveď má ísť zákazníčke");
  assert.match(interny.text, /6x Choux/, "namiesto ID má byť názov");
  assert.doesNotMatch(interny.text, /id p-choux/, "identifikátor tam nepatrí");
  assert.match(interny.text, /Jana Nováková/);
  assert.match(interny.text, /admin/, "majiteľku smieme odkázať do správy");

  // --- potvrdenie zákazníčke ---
  assert.equal(zakaznicky.to, "jana@example.sk", "ide na adresu zákazníčky");
  assert.match(zakaznicky.subject, /Ďakujem za objednávku/);
  assert.match(zakaznicky.text, /Ďakujem za objednávku!/);
  assert.match(zakaznicky.text, /6x Choux/);
  assert.match(zakaznicky.text, /Vavilovova 4/, "adresa osobného odberu");
  assert.match(zakaznicky.text, /Od srdiečka, Júlia/, "podpis");
  assert.match(zakaznicky.text, /malinové/, "poznámka zákazníčky");

  // Zákazníčka nesmie dostať nič o správe webu ani cudzie údaje.
  assert.doesNotMatch(zakaznicky.text, /admin/i, "o admin časti nesmie vedieť");
  assert.doesNotMatch(zakaznicky.text, /kolacik@/, "interná adresa tam nepatrí");
});

test("dátum je pre zákazníčku po slovensky, interne zostáva strojový", async (t) => {
  const fake = await startFakeSupabase();
  const day = iso(9);
  fake.db.open_days.push({ day, is_open: true, cap_zakusky: 18, cap_torty: 1 });

  process.env.SUPABASE_URL = fake.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fake";
  const handler = require("../api/orders");
  t.after(async () => { await fake.close(); });

  sent.length = 0;
  await objednaj(handler, {
    day,
    name: "Jana",
    phone: "0900123456",
    email: "jana@example.sk",
    note: "bez orechov",
    items: [{ product_id: "p-choux", qty: 6 }],
  });

  const [interny, zakaznicky] = sent;
  assert.match(interny.subject, new RegExp(day), "interne strojový dátum");
  assert.doesNotMatch(zakaznicky.subject, new RegExp(day), "zákazníčke nie");
  assert.match(
    zakaznicky.text,
    /\d+\. (januára|februára|marca|apríla|mája|júna|júla|augusta|septembra|októbra|novembra|decembra) \d{4}/,
    "zákazníčke čitateľný dátum"
  );
});

test("keď interná správa zlyhá, potvrdenie zákazníčke aj tak odíde", async (t) => {
  const fake = await startFakeSupabase();
  const day = iso(11);
  fake.db.open_days.push({ day, is_open: true, cap_zakusky: 18, cap_torty: 1 });

  process.env.SUPABASE_URL = fake.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fake";
  const handler = require("../api/orders");
  t.after(async () => { await fake.close(); });

  sent.length = 0;
  zlyhajPocet = 1; // prvá správa (interná) neodíde

  const out = await objednaj(handler, {
    day,
    name: "Jana",
    phone: "0900123456",
    email: "jana@example.sk",
    note: "bez orechov",
    items: [{ product_id: "p-choux", qty: 6 }],
  });

  assert.equal(out.statusCode, 200, "objednávka sa uloží aj tak");
  assert.equal(sent.length, 1, "druhá správa sa odošle nezávisle");
  assert.equal(sent[0].to, "jana@example.sk");
});

test("druhý chlebík na ten istý deň sa neprijme", async (t) => {
  const fake = await startFakeSupabase();
  const day = iso(13);
  fake.db.open_days.push({
    day, is_open: true, cap_zakusky: 18, cap_torty: 1, cap_chlebik: 1,
  });

  process.env.SUPABASE_URL = fake.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fake";
  const handler = require("../api/orders");
  t.after(async () => { await fake.close(); });

  const zakaznicka = (email) => ({
    day, name: "Jana", phone: "0900123456", email, note: "bez orechov",
    items: [{ product_id: "p-chlebik", qty: 1 }],
  });

  sent.length = 0;
  const prva = await objednaj(handler, zakaznicka("jana@example.sk"));
  assert.equal(prva.statusCode, 200, "prvý chlebík prejde");

  // Druhá zákazníčka, ten istý deň — limit je vyčerpaný.
  const druha = await objednaj(handler, zakaznicka("eva@example.sk"));
  assert.equal(druha.statusCode, 409, "druhý chlebík sa odmietne");
  assert.match(druha.body.message, /chlebík/i, "hláška má vysvetliť prečo");
  assert.equal(sent.length, 2, "za odmietnutú objednávku sa nič neposiela");
});

test("chlebík a zákusky sa nemiešajú — každý má vlastný limit", async (t) => {
  const fake = await startFakeSupabase();
  const day = iso(15);
  fake.db.open_days.push({
    day, is_open: true, cap_zakusky: 18, cap_torty: 1, cap_chlebik: 1,
  });

  process.env.SUPABASE_URL = fake.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fake";
  const handler = require("../api/orders");
  t.after(async () => { await fake.close(); });

  sent.length = 0;
  const out = await objednaj(handler, {
    day, name: "Jana", phone: "0900123456", email: "jana@example.sk", note: "bez orechov",
    items: [
      { product_id: "p-chlebik", qty: 1 },
      { product_id: "p-choux", qty: 6 },
    ],
  });
  assert.equal(out.statusCode, 200, "chlebík aj zákusky naraz musia prejsť");
});

test("číslo objednávky je v predmete oboch e-mailov aj v tele", async (t) => {
  const fake = await startFakeSupabase();
  const day = iso(17);
  fake.db.open_days.push({
    day, is_open: true, cap_zakusky: 18, cap_torty: 1, cap_chlebik: 1,
  });

  process.env.SUPABASE_URL = fake.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fake";
  process.env.SMTP_USER = "kolacik@dosrdiecka.sk";
  const handler = require("../api/orders");
  t.after(async () => { await fake.close(); });

  sent.length = 0;
  const out = await objednaj(handler, {
    day, name: "Jana", phone: "0900123456", email: "jana@example.sk", note: "bez orechov",
    items: [{ product_id: "p-choux", qty: 6 }],
  });

  assert.ok(out.body.order_no, "server vráti číslo aj do prehliadača");
  const cislo = "#" + out.body.order_no;

  const [interny, zakaznicky] = sent;
  assert.ok(interny.subject.includes(cislo),
    `interný predmet má obsahovať ${cislo}, je: ${interny.subject}`);
  assert.ok(zakaznicky.subject.includes(cislo),
    `predmet zákazníčke má obsahovať ${cislo}, je: ${zakaznicky.subject}`);
  assert.match(interny.text, new RegExp("Číslo objednávky: " + cislo));
  assert.match(zakaznicky.text, new RegExp("Číslo objednávky: " + cislo));
});

test("bez čísla objednávky e-mail aj tak odíde, bez 'undefined' v predmete", async (t) => {
  const fake = await startFakeSupabase();
  const day = iso(19);
  fake.db.open_days.push({
    day, is_open: true, cap_zakusky: 18, cap_torty: 1, cap_chlebik: 1,
  });

  process.env.SUPABASE_URL = fake.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fake";
  const handler = require("../api/orders");
  t.after(async () => { await fake.close(); });

  // Staršia databáza, ktorá poradové čísla ešte nemá.
  const povodne = fake.db.orders.push;
  fake.db.orders.push = function (o) { delete o.order_no; return povodne.call(this, o); };

  sent.length = 0;
  const out = await objednaj(handler, {
    day, name: "Jana", phone: "0900123456", email: "jana@example.sk", note: "bez orechov",
    items: [{ product_id: "p-choux", qty: 6 }],
  });
  assert.equal(out.statusCode, 200);
  for (const m of sent) {
    assert.doesNotMatch(m.subject, /undefined|#\s*$/, "predmet: " + m.subject);
    assert.doesNotMatch(m.text, /undefined/);
  }
});

test("objednávka bez poznámky sa neprijme — kvôli alergiám", async (t) => {
  const fake = await startFakeSupabase();
  const day = iso(21);
  fake.db.open_days.push({
    day, is_open: true, cap_zakusky: 18, cap_torty: 1, cap_chlebik: 1,
  });

  process.env.SUPABASE_URL = fake.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fake";
  const handler = require("../api/orders");
  t.after(async () => { await fake.close(); });

  const zaklad = {
    day, name: "Jana", phone: "0900123456", email: "jana@example.sk",
    items: [{ product_id: "p-choux", qty: 6 }],
  };

  sent.length = 0;
  const prazdna = await objednaj(handler, { ...zaklad, note: "" });
  assert.equal(prazdna.statusCode, 400, "prázdna poznámka sa odmietne");
  assert.equal(prazdna.body.error, "missing_note");

  const medzery = await objednaj(handler, { ...zaklad, note: "    " });
  assert.equal(medzery.statusCode, 400, "samé medzery tiež nestačia");

  assert.equal(sent.length, 0, "za odmietnutú objednávku sa nič neposiela");

  const vyplnena = await objednaj(handler, { ...zaklad, note: "alergia na orechy" });
  assert.equal(vyplnena.statusCode, 200, "s poznámkou objednávka prejde");
  assert.match(sent[0].text, /alergia na orechy/, "poznámka je v internej správe");
  assert.match(sent[1].text, /alergia na orechy/, "aj v potvrdení zákazníčke");
});
