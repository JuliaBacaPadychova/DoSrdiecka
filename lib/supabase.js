// Tenký klient na Supabase REST/Auth/Storage API postavený len na vstavanom
// fetch() — žiadna externá knižnica. Beží výhradne na serveri (v /api
// funkciách), nikdy v prehliadači, preto smie používať tajný service-role kľúč.

function env(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Chýba premenná prostredia ${name}`);
  return v;
}

function baseUrl() {
  return env("SUPABASE_URL").replace(/\/+$/, "");
}

function serviceKey() {
  return env("SUPABASE_SERVICE_ROLE_KEY");
}

async function parseResponse(res) {
  const text = await res.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }
  return { ok: res.ok, status: res.status, body: json };
}

// PostgREST (tabuľky a pohľady v public schéme)
async function rest(path, { method = "GET", body, prefer, extraHeaders } = {}) {
  const headers = {
    apikey: serviceKey(),
    Authorization: `Bearer ${serviceKey()}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
    ...(extraHeaders || {}),
  };
  const res = await fetch(`${baseUrl()}/rest/v1/${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const parsed = await parseResponse(res);
  if (!parsed.ok) {
    const err = new Error(
      `Supabase REST chyba (${parsed.status}): ${JSON.stringify(parsed.body)}`
    );
    err.status = parsed.status;
    err.body = parsed.body;
    throw err;
  }
  return parsed.body;
}

// Volanie uloženej funkcie (RPC), napr. create_order
async function rpc(fnName, args) {
  return rest(`rpc/${fnName}`, { method: "POST", body: args });
}

// Prihlásenie admina cez Supabase Auth (email + heslo -> access token)
async function authLogin(email, password) {
  const res = await fetch(`${baseUrl()}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: serviceKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  const parsed = await parseResponse(res);
  if (!parsed.ok) {
    const err = new Error("invalid_credentials");
    err.status = 401;
    throw err;
  }
  return parsed.body; // { access_token, user, ... }
}

// Predĺženie prihlásenia bez opätovného zadávania hesla
async function authRefresh(refreshToken) {
  const res = await fetch(`${baseUrl()}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      apikey: serviceKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const parsed = await parseResponse(res);
  if (!parsed.ok) {
    const err = new Error("invalid_refresh_token");
    err.status = 401;
    throw err;
  }
  return parsed.body;
}

// Overenie, že token patrí prihlásenému adminovi
async function authGetUser(accessToken) {
  const res = await fetch(`${baseUrl()}/auth/v1/user`, {
    headers: {
      apikey: serviceKey(),
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const parsed = await parseResponse(res);
  if (!parsed.ok) return null;
  return parsed.body;
}

// Nahratie fotky do verejného bucketu "product-images"
async function storageUpload(objectPath, buffer, contentType) {
  const res = await fetch(
    `${baseUrl()}/storage/v1/object/product-images/${objectPath}`,
    {
      method: "POST",
      headers: {
        apikey: serviceKey(),
        Authorization: `Bearer ${serviceKey()}`,
        "Content-Type": contentType,
        "x-upsert": "true",
      },
      body: buffer,
    }
  );
  const parsed = await parseResponse(res);
  if (!parsed.ok) {
    const err = new Error(`Nahratie fotky zlyhalo: ${JSON.stringify(parsed.body)}`);
    err.status = parsed.status;
    throw err;
  }
  return `${baseUrl()}/storage/v1/object/public/product-images/${objectPath}`;
}

module.exports = { rest, rpc, authLogin, authRefresh, authGetUser, storageUpload, baseUrl };
