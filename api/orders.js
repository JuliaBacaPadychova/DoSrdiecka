const { rpc } = require("../lib/supabase");
const { sendJson, readJson, withErrors } = require("../lib/http");
const { sendMail } = require("../lib/mailer");

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(str, maxLen) {
  return String(str || "").trim().slice(0, maxLen);
}

const ERROR_MESSAGES = {
  day_closed: "Na tento termín sa už žiaľ nedá objednať. Vyber si prosím iný deň.",
  no_items: "Objednávka je prázdna — pridaj aspoň jeden výrobok.",
  product_not_found: "Niektorý vybraný výrobok už nie je dostupný. Obnov stránku a skús to znova.",
  invalid_qty: "Neplatné množstvo pri niektorom výrobku.",
  below_minimum: "Pri niektorom výrobku nie je splnený minimálny odber.",
  capacity_zakusky: "Na tento termín sa už nezmestí toľko zákuskov. Skús znížiť množstvo alebo zvoliť iný deň.",
  capacity_torty: "Na tento termín je torta už obsadená — skús iný deň.",
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

  // E-mailová notifikácia majiteľke. Ak zlyhá, objednávka je aj tak uložená
  // v databáze (vidí ju v admin časti) — zákazníkovi to nezobrazujeme ako chybu.
  try {
    const notifyTo = process.env.SMTP_USER;
    if (notifyTo) {
      const itemsText = cleanItems
        .map((it) => `- ${it.qty}x (id ${it.product_id})`)
        .join("\n");
      await sendMail({
        to: notifyTo,
        replyTo: email,
        subject: `Nová objednávka na ${day}`,
        text:
          `Prišla nová predbežná objednávka.\n\n` +
          `Termín: ${day}\n` +
          `Meno: ${name}\n` +
          `Telefón: ${phone}\n` +
          `E-mail: ${email}\n` +
          `Poznámka: ${note || "—"}\n\n` +
          `Položky:\n${itemsText}\n\n` +
          `Orientačná cena: od ${result.total} €\n\n` +
          `Detaily nájdeš v admin časti webu.`,
      });
    }
  } catch (mailErr) {
    // eslint-disable-next-line no-console
    console.error("Odoslanie e-mailovej notifikácie zlyhalo:", mailErr);
  }

  sendJson(res, 200, { ok: true, order_id: result.order_id, total: result.total });
});

function extractPgErrorCode(err) {
  // Supabase REST zabalí chybu z RAISE EXCEPTION do err.body.message
  const msg = (err && err.body && (err.body.message || err.body.hint)) || err.message || "";
  const known = Object.keys(ERROR_MESSAGES);
  return known.find((code) => msg.includes(code));
}
