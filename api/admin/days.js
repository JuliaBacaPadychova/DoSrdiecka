const { rest } = require("../../lib/supabase");
const { sendJson, readJson, withErrors } = require("../../lib/http");
const { requireAdmin } = require("../../lib/auth");

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

module.exports = withErrors(
  requireAdmin(async function handler(req, res) {
    if (req.method === "GET") {
      const url = new URL(req.url, "http://x");
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      let query = "day_capacity?select=*&order=day.asc";
      if (from) query += `&day=gte.${from}`;
      if (to) query += `&day=lt.${to}`;
      const days = await rest(query);
      return sendJson(res, 200, { days });
    }

    if (req.method === "POST" || req.method === "PATCH") {
      const body = await readJson(req);
      const day = String(body.day || "");
      if (!DAY_RE.test(day)) return sendJson(res, 400, { error: "invalid_day" });

      const isOpen = body.is_open !== false;
      const capZakusky = parseInt(body.cap_zakusky, 10);
      const capTorty = parseInt(body.cap_torty, 10);
      if (!Number.isInteger(capZakusky) || capZakusky < 0) {
        return sendJson(res, 400, { error: "invalid_cap_zakusky" });
      }
      if (!Number.isInteger(capTorty) || capTorty < 0) {
        return sendJson(res, 400, { error: "invalid_cap_torty" });
      }

      const upserted = await rest("open_days?on_conflict=day", {
        method: "POST",
        body: { day, is_open: isOpen, cap_zakusky: capZakusky, cap_torty: capTorty },
        prefer: "resolution=merge-duplicates,return=representation",
      });
      return sendJson(res, 200, { day: upserted[0] || null });
    }

    if (req.method === "DELETE") {
      const url = new URL(req.url, "http://x");
      const day = url.searchParams.get("day");
      if (!day || !DAY_RE.test(day)) return sendJson(res, 400, { error: "invalid_day" });
      await rest(`open_days?day=eq.${day}`, { method: "DELETE" });
      return sendJson(res, 200, { ok: true });
    }

    sendJson(res, 405, { error: "method_not_allowed" });
  })
);
