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
  assert.match(zakaznicky.text, /Júlia, od srdiečka/, "podpis");
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
    note: "",
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
    note: "",
    items: [{ product_id: "p-choux", qty: 6 }],
  });

  assert.equal(out.statusCode, 200, "objednávka sa uloží aj tak");
  assert.equal(sent.length, 1, "druhá správa sa odošle nezávisle");
  assert.equal(sent[0].to, "jana@example.sk");
});
