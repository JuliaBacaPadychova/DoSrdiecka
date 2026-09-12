// Kartotéka surovín — bývalý hárok Ciselnik.
//
// Ceny sa menia tu, nie v kóde: špeciality z patisserie.sk si majiteľka
// prepíše podľa posledného nákupu, obal a réžiu dopíše, keď ich bude mať.
// Preto ku každej cene patrí dátum a zdroj — inak sa o pol roka nedá
// povedať, ktorá cena je ešte platná.

const { rest } = require("../../lib/supabase");
const { sendJson, readJson, withErrors } = require("../../lib/http");
const { requireAdmin } = require("../../lib/auth");

const EDITABLE_FIELDS = [
  "name",
  "unit",
  "pack_size",
  "pack_price",
  "price_date",
  "price_source",
  "negligible",
  "kind",
  "allergens",
  "note",
  "active",
];

// Prázdny reťazec z formulára znamená "nevyplnené", nie nulu. Kto
// nechá gramáž balenia prázdnu, ten cenu nevie — a kalkulácia to musí
// vypísať, nie ju potichu považovať za nulovú.
function pickFields(body) {
  const out = {};
  for (const key of EDITABLE_FIELDS) {
    if (body[key] === undefined) continue;
    const value = body[key];
    if (value === "" && key !== "price_source" && key !== "note" && key !== "allergens") {
      out[key] = null;
    } else {
      out[key] = value;
    }
  }
  return out;
}

module.exports = withErrors(
  requireAdmin(async function handler(req, res) {
    if (req.method === "GET") {
      const suroviny = await rest("ingredients?select=*&order=name.asc");
      return sendJson(res, 200, { suroviny });
    }

    if (req.method === "POST") {
      const body = await readJson(req);
      const fields = pickFields(body);
      if (!fields.name) return sendJson(res, 400, { error: "missing_name" });
      const created = await rest("ingredients", {
        method: "POST",
        body: fields,
        prefer: "return=representation",
      });
      return sendJson(res, 200, { surovina: created[0] || null });
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
      // Keď sa mení cena a dátum nie je zadaný, zapíše sa dnešok —
      // zabudnutý dátum je to isté ako žiadny.
      if (fields.pack_price !== undefined && body.price_date === undefined) {
        fields.price_date = new Date().toISOString().slice(0, 10);
      }

      const updated = await rest(`ingredients?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: fields,
        prefer: "return=representation",
      });
      return sendJson(res, 200, { surovina: updated[0] || null });
    }

    sendJson(res, 405, { error: "method_not_allowed" });
  })
);
