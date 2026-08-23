const { rest } = require("../../lib/supabase");
const { sendJson, readJson, withErrors } = require("../../lib/http");
const { requireAdmin } = require("../../lib/auth");

const EDITABLE_FIELDS = [
  "category_id",
  "name",
  "sub",
  "description",
  "alt_text",
  "price",
  "min_qty",
  "min_label",
  "allergens",
  "image_url",
  "active",
  "sort_order",
];

function pickFields(body) {
  const out = {};
  for (const key of EDITABLE_FIELDS) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
}

module.exports = withErrors(
  requireAdmin(async function handler(req, res) {
    if (req.method === "GET") {
      const products = await rest("products?select=*&order=sort_order.asc");
      return sendJson(res, 200, { products });
    }

    if (req.method === "POST") {
      const body = await readJson(req);
      const fields = pickFields(body);
      if (!fields.category_id || !fields.name || fields.price === undefined) {
        return sendJson(res, 400, { error: "missing_required_fields" });
      }
      const created = await rest("products", {
        method: "POST",
        body: fields,
        prefer: "return=representation",
      });
      return sendJson(res, 200, { product: created[0] || null });
    }

    if (req.method === "PATCH") {
      const url = new URL(req.url, "http://x");
      const id = url.searchParams.get("id");
      if (!id) return sendJson(res, 400, { error: "missing_id" });

      const body = await readJson(req);
      const fields = pickFields(body);
      if (Object.keys(fields).length === 0) {
        return sendJson(res, 400, { error: "no_fields" });
      }

      const updated = await rest(`products?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: fields,
        prefer: "return=representation",
      });
      return sendJson(res, 200, { product: updated[0] || null });
    }

    sendJson(res, 405, { error: "method_not_allowed" });
  })
);
