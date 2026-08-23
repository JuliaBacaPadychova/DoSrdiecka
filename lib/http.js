// Malé pomocné funkcie spoločné pre všetky /api funkcie.

function sendJson(res, status, data) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

// Vercel Node runtime zvyčajne req.body už spracuje na objekt, ak je
// Content-Type: application/json. Pre istotu (a pre lokálne testy) vieme
// telo prečítať aj ručne zo streamu.
async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body.length) {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// Obalí handler tak, aby sa neošetrená chyba nezrútila celú funkciu, ale
// vrátila zrozumiteľnú JSON chybu.
function withErrors(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      const status = err.status && Number.isInteger(err.status) ? err.status : 500;
      // eslint-disable-next-line no-console
      console.error(err);
      sendJson(res, status, { error: err.publicMessage || "server_error" });
    }
  };
}

module.exports = { sendJson, readJson, withErrors };
