const { authGetUser } = require("./supabase");

// Zoznam e-mailov, ktoré smú do správy webu. Nastavuje sa premennou
// prostredia ADMIN_EMAILS (viac adries oddelených čiarkou).
//
// Keď nie je vyplnená, dnu sa nedostane NIKTO. Je to zámer: prázdny
// zoznam znamená "ešte nenastavené", nie "pustiť všetkých". Radšej sa
// majiteľka na chvíľu nedostane do správy, než by sa tam dostal cudzí.
function allowedAdmins() {
  return String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function isAllowedAdmin(user) {
  const email = user && typeof user.email === "string"
    ? user.email.trim().toLowerCase()
    : "";
  if (!email) return false;
  return allowedAdmins().includes(email);
}

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

// Pomocník pre API route: zavolá handler len ak je používateľ prihlásený
// A ZÁROVEŇ je na zozname povolených adries. Samotné prihlásenie
// nestačí — do Supabase sa vie zaregistrovať aj cudzí človek a bez
// tejto kontroly by sa dostal k objednávkam aj kontaktom zákazníčok.
function requireAdmin(handler) {
  return async (req, res) => {
    const user = await getAdminUser(req);
    if (!user) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (!isAllowedAdmin(user)) {
      // eslint-disable-next-line no-console
      console.warn(
        allowedAdmins().length
          ? `Do správy sa pokúsil dostať účet mimo zoznamu: ${user.email}`
          : "Premenná ADMIN_EMAILS nie je nastavená — do správy sa nedostane nikto."
      );
      res.status(403).json({ error: "forbidden" });
      return;
    }
    req.adminUser = user;
    return handler(req, res);
  };
}

module.exports = { getAdminUser, requireAdmin, isAllowedAdmin };
