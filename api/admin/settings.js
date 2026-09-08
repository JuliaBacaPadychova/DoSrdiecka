const { rest } = require("../../lib/supabase");
const { sendJson, readJson, withErrors } = require("../../lib/http");
const { requireAdmin } = require("../../lib/auth");

const TEXTOVE_POLIA = ["hero_title", "hero_lead", "about_text"];

// Lehota na objednanie je číslo, nie text — a musí sedieť s obmedzením
// v databáze (0 až 60 dní), inak by uloženie skončilo chybou z Postgresu.
const LEAD_MIN = 0;
const LEAD_MAX = 60;

module.exports = withErrors(
  requireAdmin(async function handler(req, res) {
    if (req.method === "GET") {
      const rows = await rest("site_settings?select=*&limit=1");
      return sendJson(res, 200, { settings: rows[0] || null });
    }

    if (req.method === "PATCH") {
      const body = await readJson(req);
      const fields = {};
      for (const key of TEXTOVE_POLIA) {
        if (body[key] !== undefined) fields[key] = String(body[key]).slice(0, 2000);
      }
      if (body.lead_days !== undefined) {
        const lead = parseInt(body.lead_days, 10);
        if (!Number.isInteger(lead) || lead < LEAD_MIN || lead > LEAD_MAX) {
          return sendJson(res, 400, { error: "invalid_lead_days" });
        }
        fields.lead_days = lead;
      }
      if (Object.keys(fields).length === 0) {
        return sendJson(res, 400, { error: "no_fields" });
      }
      const updated = await rest("site_settings?id=eq.true", {
        method: "PATCH",
        body: fields,
        prefer: "return=representation",
      });
      return sendJson(res, 200, { settings: updated[0] || null });
    }

    sendJson(res, 405, { error: "method_not_allowed" });
  })
);
