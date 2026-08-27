// Testy na zopakovanie požiadavky, keď Supabase odmietne platný kľúč
// s kódom PGRST303 ("JWT issued at future"). Bez toho zákazníčka vidí
// prázdnu ponuku alebo nenačítaný kalendár.

const test = require("node:test");
const assert = require("node:assert/strict");

process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "testovaci-kluc";

const { rest } = require("../lib/supabase");

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

const SKEW_BODY = {
  code: "PGRST303",
  details: null,
  hint: null,
  message: "JWT issued at future",
};

// Podstrčí fetch, ktorý postupne vracia pripravené odpovede.
// Vráti funkciu na obnovenie pôvodného fetchu a zoznam volaní.
function stubFetch(responses) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    const next = responses[Math.min(calls.length - 1, responses.length - 1)];
    return jsonResponse(next.status, next.body);
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

test("rest() zopakuje požiadavku, keď Supabase vráti PGRST303, a druhý pokus prejde", async () => {
  const stub = stubFetch([
    { status: 401, body: SKEW_BODY },
    { status: 200, body: [{ id: "p-choux", name: "Choux" }] },
  ]);
  try {
    const rows = await rest("products?select=*");
    assert.equal(stub.calls.length, 2, "má prebehnúť druhý pokus");
    assert.deepEqual(rows, [{ id: "p-choux", name: "Choux" }]);
  } finally {
    stub.restore();
  }
});

test("rest() to vzdá po vyčerpaní pokusov a chybu vypustí ďalej", async () => {
  const stub = stubFetch([{ status: 401, body: SKEW_BODY }]);
  try {
    await assert.rejects(
      () => rest("products?select=*"),
      (err) => err.status === 401 && err.body.code === "PGRST303"
    );
    assert.equal(stub.calls.length, 3, "prvý pokus a dve zopakovania");
  } finally {
    stub.restore();
  }
});

test("rest() neopakuje bežné zamietnutie prístupu — len PGRST303", async () => {
  const stub = stubFetch([
    { status: 401, body: { code: "42501", message: "permission denied" } },
  ]);
  try {
    await assert.rejects(() => rest("products?select=*"));
    assert.equal(stub.calls.length, 1, "zlý kľúč sa opakovať nemá");
  } finally {
    stub.restore();
  }
});

test("rest() neopakuje úspešnú odpoveď", async () => {
  const stub = stubFetch([{ status: 200, body: [] }]);
  try {
    await rest("open_days?select=*");
    assert.equal(stub.calls.length, 1);
  } finally {
    stub.restore();
  }
});

test("zopakovaný zápis pošle to isté telo a metódu", async () => {
  const stub = stubFetch([
    { status: 401, body: SKEW_BODY },
    { status: 200, body: { order_id: "abc", total: 12 } },
  ]);
  try {
    const out = await rest("rpc/create_order", {
      method: "POST",
      body: { p_day: "2026-09-06" },
    });
    assert.equal(stub.calls.length, 2);
    assert.equal(stub.calls[0].init.method, "POST");
    assert.equal(stub.calls[1].init.method, "POST");
    assert.equal(stub.calls[0].init.body, stub.calls[1].init.body);
    assert.deepEqual(out, { order_id: "abc", total: 12 });
  } finally {
    stub.restore();
  }
});
