const { authLogin } = require("../../lib/supabase");
const { sendJson, readJson, withErrors } = require("../../lib/http");

module.exports = withErrors(async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "method_not_allowed" });
  }

  const body = await readJson(req);
  const email = String(body.email || "").trim();
  const password = String(body.password || "");

  if (!email || !password) {
    return sendJson(res, 400, { error: "missing_credentials" });
  }

  try {
    const session = await authLogin(email, password);
    sendJson(res, 200, {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      email: session.user && session.user.email,
    });
  } catch {
    sendJson(res, 401, { error: "invalid_credentials", message: "Nesprávny e-mail alebo heslo." });
  }
});
