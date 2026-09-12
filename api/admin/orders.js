const { rest, rpc } = require("../../lib/supabase");
const { sendJson, readJson, withErrors } = require("../../lib/http");
const { requireAdmin } = require("../../lib/auth");

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// Hlášky pre objednávku zapísanú ručne v správe. Znejú inak než tie pre
// zákazníčku — majiteľke treba povedať, čo má spraviť ona.
const CHYBY = {
  // Pri ručnom zápise sa deň založí sám, takže sem by sa už nemalo dať
  // dostať. Hláška ostáva pre istotu.
  day_closed: "Na tento deň sa zapísať nedá — skús ho pridať v Dni a limity.",
  no_items: "Vyber aspoň jeden výrobok.",
  product_not_found: "Niektorý výrobok už v ponuke nie je. Obnov stránku a skús znova.",
  invalid_qty: "Neplatný počet kusov.",
  capacity_zakusky: "Na tento deň sa toľko zákuskov už nezmestí. Zvýš limit v Dni a limity, alebo uber kusy.",
  capacity_torty: "Na tento deň je torta už obsadená. Zvýš limit v Dni a limity, alebo zvoľ iný deň.",
  capacity_chlebik: "Na tento deň je chlebík už obsadený. Zvýš limit v Dni a limity, alebo zvoľ iný deň.",
};

function kod(err) {
  const msg = (err && err.body && (err.body.message || err.body.hint)) || err.message || "";
  return Object.keys(CHYBY).find((c) => msg.includes(c));
}

module.exports = withErrors(
  requireAdmin(async function handler(req, res) {
    if (req.method === "GET") {
      const orders = await rest(
        "orders?select=*,order_items(*)&order=created_at.desc&limit=300"
      );
      return sendJson(res, 200, { orders });
    }

    // Objednávka dohodnutá mimo web. Zapisuje sa tou istou funkciou ako
    // objednávky z webu, takže rovnako zamkne deň a zaberie kapacitu —
    // len obíde lehotu na objednanie a minimálny odber.
    //
    // E-mail sa neposiela: majiteľka je so zákazníčkou v kontakte,
    // objednávku si práve s ňou dohodla.
    if (req.method === "POST") {
      const body = await readJson(req);
      const day = String(body.day || "").trim();
      const name = String(body.name || "").trim().slice(0, 120);
      const phone = String(body.phone || "").trim().slice(0, 40);
      const email = String(body.email || "").trim().slice(0, 200);
      const note = String(body.note || "").trim().slice(0, 2000);
      const items = Array.isArray(body.items) ? body.items : [];

      if (!DAY_RE.test(day)) {
        return sendJson(res, 400, { error: "invalid_day", message: "Vyber termín." });
      }
      if (!name) {
        return sendJson(res, 400, { error: "missing_name", message: "Vyplň meno zákazníčky." });
      }

      const cistePolozky = [];
      for (const it of items) {
        const productId = String((it && it.product_id) || "");
        const qty = parseInt(it && it.qty, 10);
        if (!productId || !Number.isInteger(qty) || qty <= 0) continue;
        cistePolozky.push({ product_id: productId, qty });
      }
      if (!cistePolozky.length) {
        return sendJson(res, 400, { error: "no_items", message: CHYBY.no_items });
      }

      let result;
      try {
        result = await rpc("create_order", {
          p_day: day,
          p_name: name,
          p_phone: phone,
          p_email: email,
          p_note: note,
          p_items: cistePolozky,
          p_rucne: true,
        });
      } catch (err) {
        const c = kod(err);
        return sendJson(res, 409, {
          error: c || "order_failed",
          message: CHYBY[c] || "Objednávku sa nepodarilo zapísať. Skús to prosím znova.",
        });
      }

      return sendJson(res, 200, {
        ok: true, order_id: result.order_id, order_no: result.order_no,
        total: result.total,
        // Keď deň v kalendári ešte nebol, funkcia ho založila ako zavretý.
        day_created: result.day_created === true,
      });
    }

    if (req.method === "PATCH") {
      const url = new URL(req.url, "http://x");
      const id = url.searchParams.get("id");
      if (!id) return sendJson(res, 400, { error: "missing_id" });

      const body = await readJson(req);
      const status = body.status;
      if (!["nova", "vybavena", "zrusena"].includes(status)) {
        return sendJson(res, 400, { error: "invalid_status" });
      }

      const updated = await rest(`orders?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: { status },
        prefer: "return=representation",
      });
      return sendJson(res, 200, { order: updated[0] || null });
    }

    sendJson(res, 405, { error: "method_not_allowed" });
  })
);
