const { rest } = require("../../lib/supabase");
const { sendJson, readJson, withErrors } = require("../../lib/http");
const { requireAdmin } = require("../../lib/auth");

const EDITABLE_FIELDS = ["hero_title", "hero_lead", "about_text"];

module.exports = withErrors(
  requireAdmin(async function handler(req, res) {
    if (req.method === "GET") {
      const rows = await rest("site_settings?select=*&limit=1");
      return sendJson(res, 200, { settings: rows[0] || null });
    }

    if (req.method === "PATCH") {
      const body = await readJson(req);
      const fields = {};
      for (const key of EDITABLE_FIELDS) {
        if (body[key] !== undefined) fields[key] = String(body[key]).slice(0, 2000);
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
