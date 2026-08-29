// Testy na údaj "Najbližší voľný termín" v hlavičke webu.
//
// Musí ukázať skutočný najbližší termín aj vtedy, keď je až v ďalšom
// mesiaci. Zákazníčka nemá kalendár preklikávať, aby zistila, či sa
// vôbec niekde pečie.

const test = require("node:test");
const assert = require("node:assert/strict");

const { startFakeSupabase } = require("./fake-supabase");
const handler = require("../api/days");

function den(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

// Deň v nasledujúcom mesiaci, nech nie je závislý od toho, koľkého je.
function denVBuducomMesiaci() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  d.setDate(15);
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

// Spýta sa na kalendár pre AKTUÁLNY mesiac.
async function kalendarTohtoMesiaca() {
  const now = new Date();
  const res = fakeRes();
  await handler(
    { method: "GET", url: `/api/days?year=${now.getFullYear()}&month=${now.getMonth() + 1}`, headers: {} },
    res
  );
  return res.out;
}

async function sDnami(dni, fn) {
  const fake = await startFakeSupabase();
  dni.forEach((d) => fake.db.open_days.push(d));
  process.env.SUPABASE_URL = fake.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fake";
  try {
    await fn(fake);
  } finally {
    await fake.close();
  }
}

test("termín v ďalšom mesiaci sa ukáže, aj keď pozeráme tento", async () => {
  const buduci = denVBuducomMesiaci();
  await sDnami(
    [{ day: buduci, is_open: true, cap_zakusky: 18, cap_torty: 1, cap_chlebik: 1 }],
    async () => {
      const out = await kalendarTohtoMesiaca();
      assert.equal(out.code, 200);
      assert.equal(out.body.next_free, buduci,
        "toto je presne ten prípad, keď web hlásil „čoskoro\"");
      assert.equal(out.body.days.length, 0,
        "v tomto mesiaci naozaj žiadny deň nie je");
    }
  );
});

test("plný deň sa preskočí a ukáže sa až ten ďalší voľný", async () => {
  const plny = den(3);
  const volny = den(10);
  await sDnami(
    [
      { day: plny, is_open: true, cap_zakusky: 0, cap_torty: 0, cap_chlebik: 0 },
      { day: volny, is_open: true, cap_zakusky: 18, cap_torty: 1, cap_chlebik: 1 },
    ],
    async () => {
      const out = await kalendarTohtoMesiaca();
      assert.equal(out.body.next_free, volny);
    }
  );
});

test("deň, kde ostáva menej než minimálny odber zákuskov, sa nepočíta", async () => {
  const skoroPlny = den(2);
  const volny = den(8);
  await sDnami(
    [
      // 5 zákuskov je pod minimom 6 a nič iné tam nezostáva
      { day: skoroPlny, is_open: true, cap_zakusky: 5, cap_torty: 0, cap_chlebik: 0 },
      { day: volny, is_open: true, cap_zakusky: 18, cap_torty: 1, cap_chlebik: 1 },
    ],
    async () => {
      const out = await kalendarTohtoMesiaca();
      assert.equal(out.body.next_free, volny);
    }
  );
});

test("deň, kde ostáva už len torta, sa počíta ako voľný", async () => {
  const lenTorta = den(4);
  await sDnami(
    [{ day: lenTorta, is_open: true, cap_zakusky: 0, cap_torty: 1, cap_chlebik: 0 }],
    async () => {
      const out = await kalendarTohtoMesiaca();
      assert.equal(out.body.next_free, lenTorta);
    }
  );
});

test("zatvorený deň sa nepočíta", async () => {
  const zatvoreny = den(3);
  const volny = den(9);
  await sDnami(
    [
      { day: zatvoreny, is_open: false, cap_zakusky: 18, cap_torty: 1, cap_chlebik: 1 },
      { day: volny, is_open: true, cap_zakusky: 18, cap_torty: 1, cap_chlebik: 1 },
    ],
    async () => {
      const out = await kalendarTohtoMesiaca();
      assert.equal(out.body.next_free, volny);
    }
  );
});

test("minulý deň sa nepočíta", async () => {
  const vcera = den(-1);
  const volny = den(6);
  await sDnami(
    [
      { day: vcera, is_open: true, cap_zakusky: 18, cap_torty: 1, cap_chlebik: 1 },
      { day: volny, is_open: true, cap_zakusky: 18, cap_torty: 1, cap_chlebik: 1 },
    ],
    async () => {
      const out = await kalendarTohtoMesiaca();
      assert.equal(out.body.next_free, volny);
    }
  );
});

test("keď nie je otvorený žiadny deň, vráti sa prázdno", async () => {
  await sDnami([], async () => {
    const out = await kalendarTohtoMesiaca();
    assert.equal(out.body.next_free, null, "web potom napíše „čoskoro\"");
  });
});
