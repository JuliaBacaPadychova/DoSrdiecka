// Testy na to, kto sa dostane do správy webu.
//
// Samotné prihlásenie do Supabase nestačí: keby bola v projekte
// povolená registrácia, vytvoril by si účet ktokoľvek a bez kontroly
// e-mailu by videl objednávky aj kontakty zákazníčok.

const test = require("node:test");
const assert = require("node:assert/strict");

const supabase = require("../lib/supabase");

// Podvrhnúť treba skôr, než si ho lib/auth.js pri načítaní odloží.
let ucty = {};
supabase.authGetUser = async (token) => ucty[token] || null;

const { requireAdmin, isAllowedAdmin } = require("../lib/auth");

function fakeRes() {
  const out = {};
  return {
    out,
    status(code) { out.code = code; return this; },
    json(body) { out.body = body; return this; },
    setHeader() { return this; },
    end() { return this; },
  };
}

// Zavolá chránenú route s daným tokenom a vráti, čo odpovedala.
async function skusVojst(token) {
  const handler = requireAdmin(async (req, res) => {
    res.status(200).json({ ok: true, kto: req.adminUser.email });
  });
  const res = fakeRes();
  const headers = token ? { authorization: "Bearer " + token } : {};
  await handler({ headers }, res);
  return res.out;
}

test.beforeEach(() => {
  ucty = {
    "token-julie": { id: "1", email: "julia@dosrdiecka.sk" },
    "token-votrelca": { id: "99", email: "votrelec@example.com" },
    "token-bez-mailu": { id: "7" },
  };
  process.env.ADMIN_EMAILS = "julia@dosrdiecka.sk";
});

test("majiteľka sa do správy dostane", async () => {
  const out = await skusVojst("token-julie");
  assert.equal(out.code, 200);
  assert.equal(out.body.kto, "julia@dosrdiecka.sk");
});

test("cudzí zaregistrovaný účet sa NEDOSTANE", async () => {
  const out = await skusVojst("token-votrelca");
  assert.equal(out.code, 403, "platné prihlásenie samo o sebe nestačí");
  assert.equal(out.body.error, "forbidden");
});

test("bez prihlásenia to nejde", async () => {
  assert.equal((await skusVojst(null)).code, 401);
  assert.equal((await skusVojst("neznamy-token")).code, 401);
});

test("keď ADMIN_EMAILS nie je nastavená, nedostane sa dnu nikto", async () => {
  delete process.env.ADMIN_EMAILS;
  const out = await skusVojst("token-julie");
  assert.equal(out.code, 403, "prázdny zoznam znamená zamknuté, nie otvorené");
});

test("na veľkosti písmen ani medzerách nezáleží", async () => {
  process.env.ADMIN_EMAILS = "  JULIA@DoSrdiecka.sk , druha@dosrdiecka.sk ";
  assert.equal((await skusVojst("token-julie")).code, 200);
});

test("viac adries naraz funguje, cudzia stále nie", async () => {
  process.env.ADMIN_EMAILS = "julia@dosrdiecka.sk,pomocnica@dosrdiecka.sk";
  ucty["token-pomocnice"] = { id: "2", email: "pomocnica@dosrdiecka.sk" };
  assert.equal((await skusVojst("token-pomocnice")).code, 200);
  assert.equal((await skusVojst("token-votrelca")).code, 403);
});

test("účet bez e-mailu sa dnu nedostane", async () => {
  assert.equal((await skusVojst("token-bez-mailu")).code, 403);
});

test("isAllowedAdmin neprepustí prázdne ani pokazené vstupy", () => {
  process.env.ADMIN_EMAILS = "julia@dosrdiecka.sk";
  assert.equal(isAllowedAdmin(null), false);
  assert.equal(isAllowedAdmin({}), false);
  assert.equal(isAllowedAdmin({ email: "" }), false);
  assert.equal(isAllowedAdmin({ email: "   " }), false);
  assert.equal(isAllowedAdmin({ email: "julia@dosrdiecka.sk" }), true);
});
