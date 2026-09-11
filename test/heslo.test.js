// Testy na zmenu hesla do správy webu.
//
// Heslo sa mení tokenom prihláseného používateľa, nie service-role
// kľúčom — zmeniť si ho tak môže len ten, kto je práve prihlásený.

const test = require("node:test");
const assert = require("node:assert/strict");

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

async function sPrihlasenim(t, fn) {
  const fake = await startFakeSupabase();
  process.env.SUPABASE_URL = fake.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fake";
  process.env.ADMIN_EMAILS = fake.adminCredentials.email;
  t.after(async () => { await fake.close(); });

  const handler = require("../api/admin/password");
  const relacia = await authLogin(
    fake.adminCredentials.email, fake.adminCredentials.password);

  const zmen = async (heslo, token) => {
    const res = fakeRes();
    await handler({
      method: "POST", url: "/api/admin/password",
      headers: { authorization: `Bearer ${token || relacia.access_token}` },
      body: { password: heslo },
    }, res);
    return res.out;
  };
  await fn({ fake, zmen, relacia });
}

test("prihlásená majiteľka si heslo zmení", async (t) => {
  await sPrihlasenim(t, async ({ fake, zmen }) => {
    const out = await zmen("uplneNoveHeslo2026");
    assert.equal(out.code, 200);
    assert.equal(fake.aktualneHeslo(), "uplneNoveHeslo2026");

    // Novým heslom sa dá prihlásiť, starým už nie.
    const nove = await authLogin(fake.adminCredentials.email, "uplneNoveHeslo2026");
    assert.ok(nove && nove.access_token, "nové heslo musí fungovať");
    await assert.rejects(
      () => authLogin(fake.adminCredentials.email, fake.adminCredentials.password),
      "staré heslo už nesmie fungovať"
    );
  });
});

test("krátke heslo sa neprijme", async (t) => {
  await sPrihlasenim(t, async ({ fake, zmen }) => {
    const out = await zmen("kratke123");  // 9 znakov
    assert.equal(out.code, 400);
    assert.equal(out.body.error, "password_too_short");
    assert.match(out.body.message, /10/);
    assert.equal(fake.aktualneHeslo(), fake.adminCredentials.password,
      "heslo sa nesmie zmeniť");
  });
});

test("heslo s medzerou na kraji sa neprijme", async (t) => {
  await sPrihlasenim(t, async ({ fake, zmen }) => {
    const out = await zmen(" mojeHeslo2026 ");
    assert.equal(out.code, 400);
    assert.equal(out.body.error, "password_whitespace");
    assert.equal(fake.aktualneHeslo(), fake.adminCredentials.password);
  });
});

test("bez prihlásenia sa heslo zmeniť nedá", async (t) => {
  await sPrihlasenim(t, async ({ fake, zmen }) => {
    assert.equal((await zmen("uplneNoveHeslo2026", "vymysleny-token")).code, 401);
    assert.equal(fake.aktualneHeslo(), fake.adminCredentials.password);
  });
});

test("účet mimo zoznamu ADMIN_EMAILS sa k zmene nedostane", async (t) => {
  await sPrihlasenim(t, async ({ fake, zmen }) => {
    process.env.ADMIN_EMAILS = "niekto-iny@dosrdiecka.sk";
    const out = await zmen("uplneNoveHeslo2026");
    assert.equal(out.code, 403);
    assert.equal(fake.aktualneHeslo(), fake.adminCredentials.password);
    process.env.ADMIN_EMAILS = fake.adminCredentials.email;
  });
});
