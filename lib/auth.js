const { authGetUser } = require("./supabase");

// Overí hlavičku "Authorization: Bearer <token>" oproti Supabase Auth.
// Vráti prihláseného používateľa alebo null, ak token chýba/je neplatný.
async function getAdminUser(req) {
  const header = req.headers.authorization || req.headers.Authorization;
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  if (!token) return null;
  try {
    return await authGetUser(token);
  } catch {
    return null;
  }
}

// Pomocník pre API route: zavolá handler len ak je používateľ prihlásený,
// inak vráti 401.
function requireAdmin(handler) {
  return async (req, res) => {
    const user = await getAdminUser(req);
    if (!user) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    req.adminUser = user;
    return handler(req, res);
  };
}

module.exports = { getAdminUser, requireAdmin };
