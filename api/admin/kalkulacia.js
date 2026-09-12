// Nákupný zoznam a náklady.
//
// Dva spôsoby použitia:
//   POST { polozky: [{ product_id, kusy }] }  — ručný prepočet
//   GET  ?day=2026-10-18                      — zo skutočných objednávok
//                                               na daný deň
//
// Druhý spôsob je to, čo excel nikdy nemohol: počty sa neprepisujú
// ručne, berú sa z prijatých objednávok. Zrušené objednávky sa nerátajú.

const { rest } = require("../../lib/supabase");
const { sendJson, readJson, withErrors } = require("../../lib/http");
const { requireAdmin } = require("../../lib/auth");
const { nakupnyZoznam } = require("../../lib/kalkulacia");

async function nacitatData() {
  const [ingredients, recipes, recipe_items, product_recipes] = await Promise.all([
    rest("ingredients?select=*"),
    rest("recipes?select=*"),
    rest("recipe_items?select=*"),
    rest("product_recipes?select=*"),
  ]);
  return { ingredients, recipes, recipe_items, product_recipes };
}

// Objednávky dňa zlúčené na "koľko kusov ktorej príchuti".
async function polozkyDna(day) {
  const objednavky = await rest(
    `orders?day=eq.${encodeURIComponent(day)}&status=neq.zrusena` +
      "&select=id,order_no,customer_name,order_items(product_id,name_snapshot,sub_snapshot,qty)"
  );

  const podlaVyrobku = new Map();
  const bezReceptu = [];
  for (const o of objednavky) {
    for (const p of o.order_items || []) {
      // Výrobok zmazaný z ponuky stráca väzbu na recepty — radšej to
      // vypíšeme, než aby ticho vypadol z nákupného zoznamu.
      if (!p.product_id) {
        bezReceptu.push(`${p.name_snapshot} ${p.sub_snapshot}`.trim());
        continue;
      }
      podlaVyrobku.set(p.product_id, (podlaVyrobku.get(p.product_id) || 0) + Number(p.qty || 0));
    }
  }

  return {
    polozky: [...podlaVyrobku].map(([product_id, kusy]) => ({ product_id, kusy })),
    pocet_objednavok: objednavky.length,
    bez_receptu: [...new Set(bezReceptu)],
  };
}

module.exports = withErrors(
  requireAdmin(async function handler(req, res) {
    if (req.method === "GET") {
      const url = new URL(req.url, "http://x");
      const day = url.searchParams.get("day");
      if (!day) return sendJson(res, 400, { error: "missing_day" });

      const [data, den] = await Promise.all([nacitatData(), polozkyDna(day)]);
      const zoznam = nakupnyZoznam(den.polozky, data);
      return sendJson(res, 200, {
        day,
        pocet_objednavok: den.pocet_objednavok,
        polozky: den.polozky,
        bez_receptu: den.bez_receptu,
        zoznam,
      });
    }

    if (req.method === "POST") {
      const body = await readJson(req);
      const polozky = Array.isArray(body.polozky) ? body.polozky : [];
      const data = await nacitatData();
      return sendJson(res, 200, { zoznam: nakupnyZoznam(polozky, data) });
    }

    sendJson(res, 405, { error: "method_not_allowed" });
  })
);
