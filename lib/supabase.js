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

// Bez časového limitu čaká požiadavka dovtedy, kým to nevzdá brána
// Supabase — v praxi aj 43 sekúnd. Zákazníčke sa dovtedy točí "načítavam"
// a majiteľke v správe tiež. Radšej to vzdáme skôr a povieme prečo.
const LIMIT_MS = 10000;

// Chyby, pri ktorých má zmysel skúsiť to znova: Supabase odpovedal
// chybou na svojej strane, alebo neodpovedal vôbec.
function jeDocasnaChyba(status) {
  return status === 0 || status === 429 || status >= 500;
}

// POZOR: opakovať sa smie len čítanie. Keď vyprší zápis (napríklad
// vytvorenie objednávky), nevieme, či sa medzitým nedokončil — druhý
// pokus by objednávku založil dvakrát.
function saDaOpakovat(method) {
  return method === "GET" || method === "HEAD";
}

// fetch s časovým limitom. Pri vypršaní vráti status 0, nech sa to dá
// spracovať rovnako ako chybu servera.
async function fetchSLimitom(url, init) {
  const stopka = new AbortController();
  const casovac = setTimeout(() => stopka.abort(), LIMIT_MS);
  try {
    return await fetch(url, { ...init, signal: stopka.signal });
  } catch (err) {
    const vyprsalo = err && (err.name === "AbortError" || err.name === "TimeoutError");
    const chyba = new Error(vyprsalo
      ? `Supabase neodpovedal do ${LIMIT_MS / 1000} s.`
      : `Spojenie so Supabase zlyhalo: ${err && err.message}`);
    chyba.status = 0;
    chyba.docasna = true;
    throw chyba;
  } finally {
    clearTimeout(casovac);
  }
}

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
    const posledny = attempt >= RETRY_DELAYS_MS.length;
    try {
      const res = await fetchSLimitom(url, init);
      parsed = await parseResponse(res);
    } catch (err) {
      // Vypršaný alebo prerušený pokus. Pri čítaní skúsime znova.
      if (posledny || !saDaOpakovat(method)) throw err;
      // eslint-disable-next-line no-console
      console.warn(`${err.message} pri ${method} ${path}, opakujem (pokus ${attempt + 2}).`);
      await sleep(RETRY_DELAYS_MS[attempt]);
      continue;
    }

    if (parsed.ok || posledny) break;

    // Kľúč odmietnutý pre posun hodín — odmietnutie príde ešte pred
    // vykonaním, takže opakovať sa dá aj pri zápise.
    if (isClockSkewRejection(parsed)) {
      // eslint-disable-next-line no-console
      console.warn(
        `Supabase odmietol kľúč (${CLOCK_SKEW_CODE}) pri ${method} ${path}, opakujem (pokus ${attempt + 2}).`
      );
      await sleep(RETRY_DELAYS_MS[attempt]);
      continue;
    }

    if (jeDocasnaChyba(parsed.status) && saDaOpakovat(method)) {
      // eslint-disable-next-line no-console
      console.warn(
        `Supabase vrátil ${parsed.status} pri ${method} ${path}, opakujem (pokus ${attempt + 2}).`
      );
      await sleep(RETRY_DELAYS_MS[attempt]);
      continue;
    }

    break;
  }

  if (!parsed.ok) {
    const err = new Error(
      `Supabase REST chyba (${parsed.status}): ${JSON.stringify(parsed.body)}`
    );
    err.status = parsed.status;
    err.body = parsed.body;
    // Aby volajúci vedel rozlíšiť "pokazené dáta" od "Supabase teraz
    // nevládze" a povedal to majiteľke inak.
    err.docasna = jeDocasnaChyba(parsed.status);
    throw err;
  }
  return parsed.body;
}

// Volanie uloženej funkcie (RPC), napr. create_order
async function rpc(fnName, args) {
  return rest(`rpc/${fnName}`, { method: "POST", body: args });
}

// Prihlásenie admina cez Supabase Auth (email + heslo -> access token)
// Prihlásenie. Rozlišuje dve úplne odlišné veci: Supabase povedal
// "zlé heslo" (4xx), alebo Supabase nepovedal nič (5xx, vypršanie).
// Bez toho rozlíšenia web tvrdil majiteľke, že má zlé heslo, aj keď mal
// len výpadok — a ona si ho zbytočne menila.
async function authLogin(email, password) {
  let parsed;
  try {
    const res = await fetchSLimitom(`${baseUrl()}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: serviceKey(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });
    parsed = await parseResponse(res);
  } catch (err) {
    err.docasna = true;
    throw err;
  }
  if (!parsed.ok) {
    const docasna = jeDocasnaChyba(parsed.status);
    const err = new Error(docasna
      ? `Supabase Auth vrátil ${parsed.status}.`
      : "invalid_credentials");
    err.status = docasna ? parsed.status : 401;
    err.docasna = docasna;
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
// Overenie tokenu. Vráti používateľa, null pri naozaj neplatnom tokene,
// a VYHODÍ chybu, keď sa Supabase neozval — to sú dve rôzne veci.
// Kedysi to vracalo null aj pri výpadku a majiteľku to vyhodilo
// z prihlásenia uprostred práce.
//
// Čítanie, takže sa dá bezpečne zopakovať.
async function authGetUser(accessToken) {
  const url = `${baseUrl()}/auth/v1/user`;
  const init = {
    headers: { apikey: serviceKey(), Authorization: `Bearer ${accessToken}` },
  };

  let parsed;
  for (let attempt = 0; ; attempt += 1) {
    const posledny = attempt >= RETRY_DELAYS_MS.length;
    try {
      const res = await fetchSLimitom(url, init);
      parsed = await parseResponse(res);
    } catch (err) {
      if (posledny) { err.docasna = true; throw err; }
      await sleep(RETRY_DELAYS_MS[attempt]);
      continue;
    }
    if (parsed.ok || !jeDocasnaChyba(parsed.status) || posledny) break;
    // eslint-disable-next-line no-console
    console.warn(`Supabase Auth vrátil ${parsed.status} pri overení tokenu, opakujem.`);
    await sleep(RETRY_DELAYS_MS[attempt]);
  }

  if (parsed.ok) return parsed.body;
  if (jeDocasnaChyba(parsed.status)) {
    const err = new Error(`Supabase Auth vrátil ${parsed.status} pri overení tokenu.`);
    err.status = parsed.status;
    err.docasna = true;
    throw err;
  }
  return null; // token je naozaj neplatný
}

// Zmena hesla prihláseného používateľa. Ide to jeho vlastným tokenom —
// heslo si tak môže zmeniť len ten, kto je práve prihlásený, a nie
// ktokoľvek, kto by sa dostal k service-role kľúču.
async function authUpdatePassword(accessToken, newPassword) {
  const res = await fetch(`${baseUrl()}/auth/v1/user`, {
    method: "PUT",
    headers: {
      apikey: serviceKey(),
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password: newPassword }),
  });
  const parsed = await parseResponse(res);
  if (!parsed.ok) {
    const sprava = (parsed.body && (parsed.body.msg || parsed.body.message || parsed.body.error_description))
      || "Heslo sa nepodarilo zmeniť.";
    const err = new Error(sprava);
    err.status = parsed.status;
    throw err;
  }
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

module.exports = {
  rest, rpc, authLogin, authRefresh, authGetUser, authUpdatePassword, storageUpload, baseUrl,
};
