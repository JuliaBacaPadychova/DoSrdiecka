// Receptár — recepty, ich suroviny a to, ktoré recepty tvoria príchuť.
//
// GET vráti všetko naraz (recepty, položky, väzby na výrobky aj
// suroviny). Kalkulačka aj obrazovka receptov z toho počítajú v
// prehliadači, takže sa pri každom prepočte nechodí na server.

const { rest } = require("../../lib/supabase");
const { sendJson, readJson, withErrors } = require("../../lib/http");
const { requireAdmin } = require("../../lib/auth");

const RECEPT_FIELDS = [
  "name", "kind", "yield_qty", "yield_unit", "steps", "source_url", "note", "active",
];
const POLOZKA_FIELDS = ["recipe_id", "ingredient_id", "amount", "optional", "note"];
const VAZBA_FIELDS = ["product_id", "recipe_id", "qty_per_piece", "note"];

function pick(body, allowed) {
  const out = {};
  for (const key of allowed) {
    if (body[key] === undefined) continue;
    out[key] = body[key] === "" ? null : body[key];
  }
  return out;
}

// Čo sa upravuje, povie parameter v adrese: ?polozka=<id> je surovina
// v recepte, ?vazba=<id> je priradenie receptu k príchuti, ?id=<id> je
// samotný recept.
function ciel(req) {
  const url = new URL(req.url, "http://x");
  for (const [param, tabulka, polia] of [
    ["polozka", "recipe_items", POLOZKA_FIELDS],
    ["vazba", "product_recipes", VAZBA_FIELDS],
    ["id", "recipes", RECEPT_FIELDS],
  ]) {
    const id = url.searchParams.get(param);
    if (id) return { id, tabulka, polia };
  }
  return null;
}

function novy(req) {
  const url = new URL(req.url, "http://x");
  const co = url.searchParams.get("co");
  if (co === "polozka") return { tabulka: "recipe_items", polia: POLOZKA_FIELDS };
  if (co === "vazba") return { tabulka: "product_recipes", polia: VAZBA_FIELDS };
  return { tabulka: "recipes", polia: RECEPT_FIELDS };
}

module.exports = withErrors(
  requireAdmin(async function handler(req, res) {
    if (req.method === "GET") {
      const [recepty, polozky, vazby, suroviny] = await Promise.all([
        rest("recipes?select=*&order=kind.asc,name.asc"),
        rest("recipe_items?select=*"),
        rest("product_recipes?select=*"),
        rest("ingredients?select=*&order=name.asc"),
      ]);
      return sendJson(res, 200, { recepty, polozky, vazby, suroviny });
    }

    if (req.method === "POST") {
      const { tabulka, polia } = novy(req);
      const fields = pick(await readJson(req), polia);
      if (tabulka === "recipes" && !fields.name) {
        return sendJson(res, 400, { error: "missing_name" });
      }
      const created = await rest(tabulka, {
        method: "POST",
        body: fields,
        prefer: "return=representation",
      });
      return sendJson(res, 200, { zaznam: created[0] || null });
    }

    if (req.method === "PATCH" || req.method === "DELETE") {
      const c = ciel(req);
      if (!c) return sendJson(res, 400, { error: "missing_id" });
      const cesta = `${c.tabulka}?id=eq.${encodeURIComponent(c.id)}`;

      if (req.method === "DELETE") {
        await rest(cesta, { method: "DELETE" });
        return sendJson(res, 200, { zmazane: true });
      }

      const fields = pick(await readJson(req), c.polia);
      if (Object.keys(fields).length === 0) {
        return sendJson(res, 400, { error: "no_fields" });
      }
      const updated = await rest(cesta, {
        method: "PATCH",
        body: fields,
        prefer: "return=representation",
      });
      return sendJson(res, 200, { zaznam: updated[0] || null });
    }

    sendJson(res, 405, { error: "method_not_allowed" });
  })
);
