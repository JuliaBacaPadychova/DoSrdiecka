// Testy na to, ako sa web správa, keď sa Supabase neozýva.
//
// 14. septembra 2026 vracal Supabase Auth 500, 502 a 504. Web z toho
// urobil "Nesprávny e-mail alebo heslo" a majiteľku vyhodil z prihlásenia
// uprostred práce. Tieto testy strážia, aby sa to nezopakovalo.

const test = require("node:test");
const assert = require("node:assert/strict");

process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "testovaci-kluc";

const supabase = require("../lib/supabase");
const { rest, authLogin, authGetUser } = supabase;

function odpoved(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

// Podstrčí fetch, ktorý postupne vracia pripravené odpovede.
function podvrhni(odpovede) {
  const povodny = globalThis.fetch;
  const volania = [];
  globalThis.fetch = async (url, init) => {
    volania.push({ url, init, method: (init && init.method) || "GET" });
    const dalsia = odpovede[Math.min(volania.length - 1, odpovede.length - 1)];
    if (dalsia.nikdyNeodpovie) {
      // Server, ktorý mlčí — presne to, čo robil Supabase pri 504.
      return new Promise((_, reject) => {
        init.signal.addEventListener("abort", () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          reject(e);
        });
      });
    }
    return odpoved(dalsia.status, dalsia.body);
  };
  return { volania, obnov: () => { globalThis.fetch = povodny; } };
}

// --- čítanie sa opakuje, zápis nie -------------------------------------

test("čítanie sa pri chybe servera zopakuje a druhý pokus prejde", async () => {
  const p = podvrhni([
    { status: 504, body: { message: "Gateway Timeout" } },
    { status: 200, body: [{ id: "p-choux" }] },
  ]);
  try {
    const data = await rest("products?select=*");
    assert.deepEqual(data, [{ id: "p-choux" }]);
    assert.equal(p.volania.length, 2, "prvý pokus zlyhal, druhý prešiel");
  } finally { p.obnov(); }
});

test("zápis sa pri chybe servera NEZOPAKUJE", async () => {
  // Kritické: pri 504 nevieme, či sa objednávka medzitým nezaložila.
  // Druhý pokus by ju mohol založiť druhýkrát.
  const p = podvrhni([{ status: 504, body: { message: "Gateway Timeout" } }]);
  try {
    await assert.rejects(
      () => rest("rpc/create_order", { method: "POST", body: { p_day: "2026-10-01" } }),
      (err) => err.status === 504 && err.docasna === true
    );
    assert.equal(p.volania.length, 1, "zápis sa smie skúsiť len raz");
  } finally { p.obnov(); }
});

test("chyba v dátach sa neopakuje ani pri čítaní", async () => {
  const p = podvrhni([{ status: 400, body: { message: "syntax error" } }]);
  try {
    await assert.rejects(
      () => rest("products?select=*"),
      (err) => err.status === 400 && err.docasna === false
    );
    assert.equal(p.volania.length, 1, "opakovať pokazenú požiadavku nemá zmysel");
  } finally { p.obnov(); }
});

test("keď Supabase mlčí, požiadavka sa vzdá sama a nečaká donekonečna", async () => {
  const p = podvrhni([{ nikdyNeodpovie: true }]);
  const zaciatok = Date.now();
  try {
    await assert.rejects(
      () => rest("rpc/create_order", { method: "POST", body: {} }),
      (err) => err.status === 0 && err.docasna === true
    );
    assert.ok(Date.now() - zaciatok < 12000, "nesmie visieť 43 sekúnd ako 14. septembra");
  } finally { p.obnov(); }
});

// --- prihlásenie --------------------------------------------------------

test("zlé heslo ostáva zlým heslom", async () => {
  const p = podvrhni([{ status: 400, body: { error: "invalid_grant" } }]);
  try {
    await assert.rejects(
      () => authLogin("julia@dosrdiecka.sk", "zle"),
      (err) => err.status === 401 && !err.docasna
    );
  } finally { p.obnov(); }
});

test("výpadok Auth sa NESMIE tváriť ako zlé heslo", async () => {
  for (const status of [500, 502, 503, 504]) {
    const p = podvrhni([{ status, body: {} }]);
    try {
      await assert.rejects(
        () => authLogin("julia@dosrdiecka.sk", "spravne-heslo"),
        (err) => err.docasna === true && err.status === status,
        `pri ${status} sa heslo obviňovať nemá`
      );
    } finally { p.obnov(); }
  }
});

test("prihlasovacia route pri výpadku vráti 503 a povie, že heslo je zrejme v poriadku", async () => {
  const p = podvrhni([{ status: 502, body: {} }]);
  const handler = require("../api/admin/login");
  const out = {};
  const res = {
    status(c) { out.code = c; return this; },
    setHeader() { return this; },
    end(t) { if (t) out.body = JSON.parse(t); return this; },
  };
  try {
    await handler({ method: "POST", url: "/api/admin/login", headers: {},
      body: { email: "julia@dosrdiecka.sk", password: "spravne-heslo" } }, res);
    assert.equal(out.code, 503);
    assert.equal(out.body.error, "auth_unavailable");
    assert.match(out.body.message, /heslo máš zrejme v poriadku/);
    assert.doesNotMatch(out.body.message, /Nesprávny/);
  } finally { p.obnov(); }
});

// --- overenie tokenu ----------------------------------------------------

test("neplatný token je neplatný token", async () => {
  const p = podvrhni([{ status: 401, body: { message: "invalid token" } }]);
  try {
    assert.equal(await authGetUser("vymysleny"), null);
  } finally { p.obnov(); }
});

test("overenie tokenu sa pri chybe servera zopakuje", async () => {
  const p = podvrhni([
    { status: 500, body: {} },
    { status: 200, body: { id: "1", email: "julia@dosrdiecka.sk" } },
  ]);
  try {
    const user = await authGetUser("platny");
    assert.equal(user.email, "julia@dosrdiecka.sk");
    assert.equal(p.volania.length, 2);
  } finally { p.obnov(); }
});

test("keď sa Auth neozve ani po zopakovaní, správa webu vráti 503, nie 401", async () => {
  // 401 by majiteľku vyhodilo na prihlásenie uprostred rozrobenej práce.
  const p = podvrhni([{ status: 500, body: {} }]);
  const { requireAdmin } = require("../lib/auth");
  process.env.ADMIN_EMAILS = "julia@dosrdiecka.sk";
  const out = {};
  const res = {
    status(c) { out.code = c; return this; },
    json(b) { out.body = b; return this; },
    setHeader() { return this; },
    end() { return this; },
  };
  const handler = requireAdmin(async () => { out.pustilo = true; });
  try {
    await handler({ headers: { authorization: "Bearer platny" } }, res);
    assert.equal(out.code, 503, "výpadok nie je odhlásenie");
    assert.equal(out.body.error, "auth_unavailable");
    assert.ok(!out.pustilo, "chránenú časť to spustiť nesmie");
  } finally { p.obnov(); }
});
