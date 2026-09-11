const { authUpdatePassword } = require("../../lib/supabase");
const { sendJson, readJson, withErrors } = require("../../lib/http");
const { requireAdmin } = require("../../lib/auth");

// Krátke heslo je pri jedinom účte, ktorý vidí objednávky aj kontakty
// zákazníčok, to posledné, na čom šetriť. Supabase pustí aj šesť znakov,
// my chceme viac.
const MIN_DLZKA = 10;

module.exports = withErrors(
  requireAdmin(async function handler(req, res) {
    if (req.method !== "POST") {
      return sendJson(res, 405, { error: "method_not_allowed" });
    }

    const body = await readJson(req);
    const heslo = typeof body.password === "string" ? body.password : "";

    if (heslo.length < MIN_DLZKA) {
      return sendJson(res, 400, {
        error: "password_too_short",
        message: `Heslo musí mať aspoň ${MIN_DLZKA} znakov.`,
      });
    }
    if (heslo.trim() !== heslo) {
      return sendJson(res, 400, {
        error: "password_whitespace",
        message: "Heslo nesmie začínať ani končiť medzerou — ľahko sa to prehliadne.",
      });
    }

    // Meníme ho tokenom prihláseného používateľa, nie service-role kľúčom:
    // tak sa dá zmeniť len vlastné heslo a len počas prihlásenia.
    const token = req.headers.authorization.slice("Bearer ".length).trim();
    try {
      await authUpdatePassword(token, heslo);
    } catch (err) {
      return sendJson(res, err.status === 422 ? 400 : 502, {
        error: "password_rejected",
        message: err.message,
      });
    }

    return sendJson(res, 200, { ok: true });
  })
);
