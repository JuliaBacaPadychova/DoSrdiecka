const { rpc, rest } = require("../lib/supabase");
const { sendJson, readJson, withErrors } = require("../lib/http");
const { sendMail } = require("../lib/mailer");

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(str, maxLen) {
  return String(str || "").trim().slice(0, maxLen);
}

const MESIACE = ["", "januára", "februára", "marca", "apríla", "mája", "júna",
  "júla", "augusta", "septembra", "októbra", "novembra", "decembra"];

// "2026-09-06" -> "6. septembra 2026" (pre e-mail zákazníčke)
function dlhyDatum(day) {
  const [y, m, d] = day.split("-").map(Number);
  return `${d}. ${MESIACE[m]} ${y}`;
}

// Adresa osobného odberu. Keby sa menila, stačí prepísať tu a v pätičke webu.
const ODBER = "Vavilovova 4, Petržalka, Bratislava";

const ERROR_MESSAGES = {
  day_closed: "Na tento termín sa už žiaľ nedá objednať. Vyber si prosím iný deň.",
  no_items: "Objednávka je prázdna — pridaj aspoň jeden výrobok.",
  product_not_found: "Niektorý vybraný výrobok už nie je dostupný. Obnov stránku a skús to znova.",
  invalid_qty: "Neplatné množstvo pri niektorom výrobku.",
  below_minimum: "Pri niektorom výrobku nie je splnený minimálny odber.",
  capacity_zakusky: "Na tento termín sa už nezmestí toľko zákuskov. Skús znížiť množstvo alebo zvoliť iný deň.",
  capacity_torty: "Na tento termín je torta už obsadená — skús iný deň.",
  capacity_chlebik: "Na tento termín je chlebík už obsadený — skús iný deň.",
};

module.exports = withErrors(async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "method_not_allowed" });
  }

  const body = await readJson(req);

  const day = clean(body.day, 10);
  const name = clean(body.name, 120);
  const phone = clean(body.phone, 40);
  const email = clean(body.email, 200);
  const note = clean(body.note, 2000);
  const items = Array.isArray(body.items) ? body.items : [];

  if (!DAY_RE.test(day)) return sendJson(res, 400, { error: "invalid_day" });
  if (!name) return sendJson(res, 400, { error: "missing_name" });
  if (!phone) return sendJson(res, 400, { error: "missing_phone" });
  if (!EMAIL_RE.test(email)) return sendJson(res, 400, { error: "invalid_email" });
  // Poznámka je povinná kvôli alergiám a intoleranciám — pri jedle to
  // nie je zdvorilostný údaj. Kontrola musí byť aj tu, nielen vo
  // formulári, inak sa dá obísť.
  if (!note) return sendJson(res, 400, { error: "missing_note" });
  if (!items.length) return sendJson(res, 400, { error: "no_items" });

  const cleanItems = [];
  for (const it of items) {
    const productId = String(it && it.product_id || "");
    const qty = parseInt(it && it.qty, 10);
    if (!productId || !Number.isInteger(qty) || qty <= 0) {
      return sendJson(res, 400, { error: "invalid_item" });
    }
    cleanItems.push({ product_id: productId, qty });
  }

  let result;
  try {
    result = await rpc("create_order", {
      p_day: day,
      p_name: name,
      p_phone: phone,
      p_email: email,
      p_note: note,
      p_items: cleanItems,
    });
  } catch (err) {
    const code = extractPgErrorCode(err);
    const message = ERROR_MESSAGES[code] || "Objednávku sa nepodarilo odoslať. Skús to prosím znova.";
    return sendJson(res, 409, { error: code || "order_failed", message });
  }

  // Názvy výrobkov tak, ako boli v čase objednávky (order_items ich drží
  // odložené), aby v e-mailoch nefigurovali len vnútorné identifikátory.
  // Keď sa nepodarí načítať, e-mail aj tak odíde — len s množstvami.
  let itemsText = cleanItems.map((it) => `- ${it.qty}x`).join("\n");
  try {
    const rows = await rest(
      `order_items?order_id=eq.${encodeURIComponent(result.order_id)}` +
      `&select=name_snapshot,sub_snapshot,qty&order=name_snapshot.asc`
    );
    if (rows && rows.length) {
      itemsText = rows
        .map((r) => `- ${r.qty}x ${r.name_snapshot}${r.sub_snapshot ? ` (${r.sub_snapshot})` : ""}`)
        .join("\n");
    }
  } catch (itemsErr) {
    // eslint-disable-next-line no-console
    console.error("Načítanie názvov položiek pre e-mail zlyhalo:", itemsErr);
  }

  // Dve samostatné správy: interná pre majiteľku a potvrdenie zákazníčke.
  // Posielajú sa nezávisle — keď zlyhá jedna, druhá sa aj tak pokúsi odísť
  // a objednávka je v oboch prípadoch uložená v databáze.
  const notifyTo = process.env.SMTP_USER;
  // Poradové číslo pre ľudí. Keby ho starší záznam nemal, e-mail radšej
  // odíde bez neho než by mal v predmete "undefined".
  const cislo = result.order_no ? `#${result.order_no}` : "";

  if (notifyTo) {
    try {
      await sendMail({
        to: notifyTo,
        replyTo: email,
        subject: cislo
          ? `Objednávka ${cislo} na ${day}`
          : `Nová objednávka na ${day}`,
        text:
          `Prišla nová predbežná objednávka.\n\n` +
          (cislo ? `Číslo objednávky: ${cislo}\n` : "") +
          `Termín: ${day}\n` +
          `Meno: ${name}\n` +
          `Telefón: ${phone}\n` +
          `E-mail: ${email}\n` +
          `Poznámka: ${note || "—"}\n\n` +
          `Položky:\n${itemsText}\n\n` +
          `Orientačná cena: od ${result.total} €\n\n` +
          `Detaily nájdeš v admin časti webu.`,
      });
    } catch (mailErr) {
      // eslint-disable-next-line no-console
      console.error("Odoslanie e-mailovej notifikácie zlyhalo:", mailErr);
    }

    try {
      await sendMail({
        to: email,
        subject: cislo
          ? `Ďakujem za objednávku ${cislo} na ${dlhyDatum(day)}`
          : `Ďakujem za objednávku na ${dlhyDatum(day)}`,
        text:
          `Ďakujem za objednávku!\n\n` +
          `Tvoju predbežnú objednávku mám. Ozvem sa ti s potvrdením termínu a konečnou cenou.\n\n` +
          (cislo ? `Číslo objednávky: ${cislo}\n` : "") +
          `Termín: ${dlhyDatum(day)}\n` +
          `Objednávka:\n${itemsText}\n\n` +
          `Orientačná cena: od ${result.total} €\n` +
          (note ? `Poznámka: ${note}\n` : "") +
          `\n` +
          `Výrobky si vyzdvihneš osobne na adrese ${ODBER}.\n` +
          `Na čase odberu sa dohodneme, keď ti termín potvrdím.\n\n` +
          `Ak niečo nesedí, stačí odpovedať na tento e-mail.\n\n` +
          `Od srdiečka, Júlia`,
      });
    } catch (mailErr) {
      // eslint-disable-next-line no-console
      console.error("Odoslanie potvrdenia zákazníčke zlyhalo:", mailErr);
    }
  }

  sendJson(res, 200, {
    ok: true,
    order_id: result.order_id,
    order_no: result.order_no,
    total: result.total,
  });
});

function extractPgErrorCode(err) {
  // Supabase REST zabalí chybu z RAISE EXCEPTION do err.body.message
  const msg = (err && err.body && (err.body.message || err.body.hint)) || err.message || "";
  const known = Object.keys(ERROR_MESSAGES);
  return known.find((code) => msg.includes(code));
}
