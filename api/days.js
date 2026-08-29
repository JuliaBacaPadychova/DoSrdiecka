const { rest } = require("../lib/supabase");
const { sendJson, withErrors } = require("../lib/http");

// Deň je "voľný", keď sa naň ešte zmestí aspoň jedna vec: šesť zákuskov
// (toľko je minimálny odber), torta alebo chlebík.
// Musí sedieť s tým, čo za voľné považuje kalendár v public/assets/app.js.
const MIN_ZAKUSKY = 6;

function jeVolny(d) {
  return Boolean(d && d.is_open) && (
    d.remaining_zakusky >= MIN_ZAKUSKY ||
    d.remaining_torty >= 1 ||
    d.remaining_chlebik >= 1
  );
}

// Najbližší voľný termín naprieč všetkými dňami, nielen zobrazeným
// mesiacom — inak by zákazníčka v auguste nevidela, že piecť sa začína
// až v septembri, a musela by kalendár preklikávať naslepo.
async function najblizsiVolny() {
  const dnes = new Date().toISOString().slice(0, 10);
  const dni = await rest(
    `day_capacity?select=*&is_open=is.true&day=gte.${dnes}&order=day.asc&limit=400`
  );
  const volny = (dni || []).find(jeVolny);
  return volny ? volny.day : null;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

module.exports = withErrors(async function handler(req, res) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "method_not_allowed" });
  }

  const url = new URL(req.url, "http://x");
  const year = parseInt(url.searchParams.get("year"), 10);
  const month = parseInt(url.searchParams.get("month"), 10); // 1-12

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return sendJson(res, 400, { error: "invalid_year_or_month" });
  }

  const from = `${year}-${pad2(month)}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const to = `${nextYear}-${pad2(nextMonth)}-01`;

  const [days, nextFree] = await Promise.all([
    rest(`day_capacity?select=*&day=gte.${from}&day=lt.${to}&order=day.asc`),
    najblizsiVolny(),
  ]);

  sendJson(res, 200, { days, next_free: nextFree });
});
