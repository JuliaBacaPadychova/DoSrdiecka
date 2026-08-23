const { storageUpload } = require("../../lib/supabase");
const { sendJson, readJson, withErrors } = require("../../lib/http");
const { requireAdmin } = require("../../lib/auth");

const ALLOWED_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function sanitize(name) {
  const withoutExt = String(name || "foto").replace(/\.[a-zA-Z0-9]+$/, "");
  return withoutExt
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .slice(0, 60) || "foto";
}

module.exports = withErrors(
  requireAdmin(async function handler(req, res) {
    if (req.method !== "POST") {
      return sendJson(res, 405, { error: "method_not_allowed" });
    }

    const body = await readJson(req);
    const contentType = body.contentType;
    const ext = ALLOWED_TYPES[contentType];
    if (!ext) {
      return sendJson(res, 400, { error: "unsupported_type" });
    }
    if (!body.contentBase64) {
      return sendJson(res, 400, { error: "missing_content" });
    }

    const buffer = Buffer.from(body.contentBase64, "base64");
    const MAX_BYTES = 6 * 1024 * 1024;
    if (buffer.length === 0 || buffer.length > MAX_BYTES) {
      return sendJson(res, 400, { error: "invalid_size" });
    }

    const objectPath = `${Date.now()}-${sanitize(body.filename)}.${ext}`;
    const url = await storageUpload(objectPath, buffer, contentType);
    sendJson(res, 200, { url });
  })
);
