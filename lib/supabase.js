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

// Supabase občas odmietne aj platný kľúč s kódom PGRST303 ("JWT issued at
// future") — ich overovací uzol má v tej chvíli hodiny pozadu za časom
// vystavenia kľúča. Netýka sa to celého spojenia, ale jednotlivej
// požiadavky: v logoch vidno, ako v tej istej milisekunde jedna prejde
// a druhá nie. Bez zopakovania to zákazníčka vidí ako prázdnu ponuku
// alebo kalendár, ktorý sa "nepodarilo načítať".
//
// Zamietnutie nastáva ešte pred spustením SQL, takže požiadavka nemá
// žiadny účinok a zopakovať sa dá bezpečne — vrátane zápisov a
// vytvorenia objednávky.
const CLOCK_SKEW_CODE = "PGRST303";
const RETRY_DELAYS_MS = [250, 750];

function isClockSkewRejection(parsed) {
  return (
    parsed.status === 401 &&
    parsed.body &&
    typeof parsed.body === "object" &&
    parsed.body.code === CLOCK_SKEW_CODE
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  const url = `${baseUrl()}/rest/v1/${path}`;
  const init = {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };

  let parsed;
  for (let attempt = 0; ; attempt += 1) {
    const res = await fetch(url, init);
    parsed = await parseResponse(res);
    if (!isClockSkewRejection(parsed) || attempt >= RETRY_DELAYS_MS.length) break;
    // eslint-disable-next-line no-console
    console.warn(
      `Supabase odmietol kľúč (${CLOCK_SKEW_CODE}) pri ${method} ${path}, opakujem (pokus ${attempt + 2}).`
    );
    await sleep(RETRY_DELAYS_MS[attempt]);
  }

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
