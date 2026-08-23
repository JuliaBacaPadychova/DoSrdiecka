const { authRefresh } = require("../../lib/supabase");
const { sendJson, readJson, withErrors } = require("../../lib/http");

module.exports = withErrors(async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "method_not_allowed" });
  }
  const body = await readJson(req);
  const refreshToken = body.refresh_token;
  if (!refreshToken) return sendJson(res, 400, { error: "missing_refresh_token" });

  try {
    const session = await authRefresh(refreshToken);
    sendJson(res, 200, {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
  } catch {
    sendJson(res, 401, { error: "invalid_refresh_token" });
  }
});
