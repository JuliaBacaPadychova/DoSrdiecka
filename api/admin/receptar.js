// Receptár: suroviny, recepty a kalkulácia nákladov.
//
// Všetko je zámerne v JEDNEJ funkcii, nie v troch samostatných. Vercel
// na bezplatnom pláne pustí najviac 12 serverless funkcií na nasadenie
// (https://vercel.com/docs/functions/limitations) a projekt ich má už
// jedenásť — tri ďalšie by nasadenie zhodili.
//
//   GET    /api/admin/receptar              — suroviny, recepty, položky, väzby
//   GET    /api/admin/receptar?den=2026-10-18 — nákupný zoznam z objednávok dňa
//   POST   /api/admin/receptar?co=kalkulacia  — ručný prepočet
//   POST   /api/admin/receptar?co=surovina|recept|polozka|vazba
//   PATCH  /api/admin/receptar?co=...&id=...
//   DELETE /api/admin/receptar?co=...&id=...

const { rest } = require("../../lib/supabase");
const { sendJson, readJson, withErrors } = require("../../lib/http");
const { requireAdmin } = require("../../lib/auth");
const { nakupnyZoznam } = require("../../lib/kalkulacia");

// Čo sa dá meniť. Čokoľvek mimo týchto zoznamov sa z tela požiadavky
// zahodí — aby sa cez formulár nedalo prepísať id ani cudzí stĺpec.
const TYPY = {
  surovina: {
    tabulka: "ingredients",
    polia: ["name", "unit", "pack_size", "pack_price", "price_date",
            "price_source", "negligible", "kind", "allergens", "note", "active"],
    texty: ["price_source", "note", "allergens"],
  },
  recept: {
    tabulka: "recipes",
    polia: ["name", "kind", "yield_qty", "yield_unit", "steps", "source_url", "note", "active"],
    texty: ["steps", "source_url", "note"],
  },
  polozka: {
    tabulka: "recipe_items",
    polia: ["recipe_id", "ingredient_id", "amount", "optional", "note"],
    texty: ["note"],
  },
  vazba: {
    tabulka: "product_recipes",
    polia: ["product_id", "recipe_id", "qty_per_piece", "note"],
    texty: ["note"],
  },
};

// Prázdne políčko z formulára znamená "nevyplnené", nie nulu. Pri
// textoch je ale prázdny reťazec v poriadku — stĺpce sú not null.
function pick(body, typ) {
  const out = {};
  for (const key of typ.polia) {
    if (body[key] === undefined) continue;
    out[key] = body[key] === "" && !typ.texty.includes(key) ? null : body[key];
  }
  return out;
}

async function nacitatReceptar() {
  const [suroviny, recepty, polozky, vazby] = await Promise.all([
    rest("ingredients?select=*&order=name.asc"),
    rest("recipes?select=*&order=kind.asc,name.asc"),
    rest("recipe_items?select=*"),
    rest("product_recipes?select=*"),
  ]);
  return { suroviny, recepty, polozky, vazby };
}

// Tvar, v akom počíta lib/kalkulacia.js.
function preVypocet({ suroviny, recepty, polozky, vazby }) {
  return {
    ingredients: suroviny,
    recipes: recepty,
    recipe_items: polozky,
    product_recipes: vazby,
  };
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
    const url = new URL(req.url, "http://x");
    const co = url.searchParams.get("co");
    const id = url.searchParams.get("id");
    const typ = co && TYPY[co] ? TYPY[co] : null;

    if (req.method === "GET") {
      const den = url.searchParams.get("den");
      if (!den) return sendJson(res, 200, await nacitatReceptar());

      const [receptar, objednane] = await Promise.all([nacitatReceptar(), polozkyDna(den)]);
      return sendJson(res, 200, {
        den,
        pocet_objednavok: objednane.pocet_objednavok,
        polozky: objednane.polozky,
        bez_receptu: objednane.bez_receptu,
        zoznam: nakupnyZoznam(objednane.polozky, preVypocet(receptar)),
      });
    }

    if (req.method === "POST" && co === "kalkulacia") {
      const body = await readJson(req);
      const polozky = Array.isArray(body.polozky) ? body.polozky : [];
      const receptar = await nacitatReceptar();
      return sendJson(res, 200, { zoznam: nakupnyZoznam(polozky, preVypocet(receptar)) });
    }

    if (!typ) return sendJson(res, 400, { error: "unknown_type" });

    if (req.method === "POST") {
      const fields = pick(await readJson(req), typ);
      if ((co === "surovina" || co === "recept") && !fields.name) {
        return sendJson(res, 400, { error: "missing_name" });
      }
      const created = await rest(typ.tabulka, {
        method: "POST",
        body: fields,
        prefer: "return=representation",
      });
      return sendJson(res, 200, { zaznam: created[0] || null });
    }

    if (req.method === "PATCH" || req.method === "DELETE") {
      if (!id) return sendJson(res, 400, { error: "missing_id" });
      const cesta = `${typ.tabulka}?id=eq.${encodeURIComponent(id)}`;

      if (req.method === "DELETE") {
        await rest(cesta, { method: "DELETE" });
        return sendJson(res, 200, { zmazane: true });
      }

      const body = await readJson(req);
      const fields = pick(body, typ);
      if (Object.keys(fields).length === 0) {
        return sendJson(res, 400, { error: "no_fields" });
      }
      // Zmena ceny bez dátumu je cena bez platnosti — doplní sa dnešok.
      if (co === "surovina" && fields.pack_price !== undefined && body.price_date === undefined) {
        fields.price_date = new Date().toISOString().slice(0, 10);
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
