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

// Dnešok sa musí počítať v našom čase, nie vo svetovom. Server beží v UTC
// a medzi polnocou a druhou ráno je o deň pozadu — v noci by teda ponúkol
// termín o deň skorší, než na aký sa dá objednať.
const ZONA = "Europe/Bratislava";

function dnesLokalne() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date());
}

function plusDni(den, pocet) {
  const d = new Date(`${den}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + pocet);
  return d.toISOString().slice(0, 10);
}

// Koľko dní vopred sa musí objednať. Nastavuje sa v Správa → Nastavenia;
// keď sa hodnotu nepodarí načítať, radšej nepustíme nič bližšie než
// predvolené štyri dni, ako by sme mali prijať objednávku na zajtra.
const LEAD_DNI_PREDVOLENE = 4;

async function najskorsiTermin() {
  let lead = LEAD_DNI_PREDVOLENE;
  try {
    const rows = await rest("site_settings?select=lead_days&limit=1");
    const hodnota = rows && rows[0] && rows[0].lead_days;
    if (Number.isInteger(hodnota) && hodnota >= 0) lead = hodnota;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Načítanie lehoty na objednanie zlyhalo, beriem predvolenú:", err);
  }
  return { lead, najskorsi: plusDni(dnesLokalne(), lead) };
}

// Najbližší voľný termín naprieč všetkými dňami, nielen zobrazeným
// mesiacom — inak by zákazníčka v auguste nevidela, že piecť sa začína
// až v septembri, a musela by kalendár preklikávať naslepo.
//
// Dni, ktoré sú už bližšie než lehota, sa preskočia: ukázať termín, na
// ktorý sa aj tak nedá objednať, by ju len poslalo klikať naprázdno.
async function najblizsiVolny(najskorsi) {
  const dni = await rest(
    `day_capacity?select=*&is_open=is.true&day=gte.${najskorsi}&order=day.asc&limit=400`
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

  const { lead, najskorsi } = await najskorsiTermin();
  const [days, nextFree] = await Promise.all([
    rest(`day_capacity?select=*&day=gte.${from}&day=lt.${to}&order=day.asc`),
    najblizsiVolny(najskorsi),
  ]);

  // "earliest" je prvý dátum, na ktorý sa ešte dá objednať. Kalendár
  // podľa neho zošedne dni, ktoré sú už príliš blízko — počítať to
  // v prehliadači by znamenalo riešiť časové pásmo aj tam.
  sendJson(res, 200, { days, next_free: nextFree, earliest: najskorsi, lead_days: lead });
});
