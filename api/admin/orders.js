const { rest } = require("../../lib/supabase");
const { sendJson, readJson, withErrors } = require("../../lib/http");
const { requireAdmin } = require("../../lib/auth");

module.exports = withErrors(
  requireAdmin(async function handler(req, res) {
    if (req.method === "GET") {
      const orders = await rest(
        "orders?select=*,order_items(*)&order=created_at.desc&limit=300"
      );
      return sendJson(res, 200, { orders });
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
