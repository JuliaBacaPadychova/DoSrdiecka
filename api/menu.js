const { rest } = require("../lib/supabase");
const { sendJson, withErrors } = require("../lib/http");

module.exports = withErrors(async function handler(req, res) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "method_not_allowed" });
  }

  const [categories, products, settings] = await Promise.all([
    rest("categories?select=*&order=sort_order.asc"),
    rest("products?select=*&active=is.true&order=sort_order.asc"),
    rest("site_settings?select=*&limit=1"),
  ]);

  sendJson(res, 200, {
    categories,
    products,
    settings: settings[0] || null,
  });
});
