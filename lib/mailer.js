// Minimalistický SMTP klient postavený len na vstavanom Node module "tls" —
// žiadna externá knižnica (napr. nodemailer) nie je potrebná. Posiela sa cez
// existujúcu e-mailovú schránku (napr. kolacik@dosrdiecka.sk) cez jej SMTP
// server (implicitné TLS, zvyčajne port 465).
//
// Prečo takto: čím menej vonkajších závislostí, tým menej vecí sa môže časom
// pokaziť pri aktualizáciách balíčkov — pre projekt, ktorý bude bežať roky
// bez programátora, je to najspoľahlivejšie.

const tls = require("tls");

function b64(s) {
  return Buffer.from(s, "utf8").toString("base64");
}

function encodeSubject(subject) {
  return `=?UTF-8?B?${b64(subject)}?=`;
}

function encodeBodyBase64(text) {
  const lines = Buffer.from(text, "utf8").toString("base64").match(/.{1,76}/g) || [""];
  return lines.join("\r\n");
}

class SmtpError extends Error {}

function createLineReader(socket) {
  let buffer = "";
  let queue = []; // resolvers waiting for a full (possibly multiline) response

  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    let idx;
    while ((idx = buffer.indexOf("\r\n")) !== -1) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      handleLine(line);
    }
  });

  let pendingLines = [];
  function handleLine(line) {
    pendingLines.push(line);
    const isFinal = /^\d{3} /.test(line) || /^\d{3}$/.test(line);
    if (isFinal) {
      const lines = pendingLines;
      pendingLines = [];
      const resolver = queue.shift();
      if (resolver) resolver({ code: parseInt(lines[0].slice(0, 3), 10), lines });
    }
  }

  function waitResponse(timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        queue = queue.filter((r) => r !== wrapped);
        reject(new SmtpError("SMTP: vypršal čas čakania na odpoveď servera"));
      }, timeoutMs);
      const wrapped = (res) => {
        clearTimeout(timer);
        resolve(res);
      };
      queue.push(wrapped);
    });
  }

  return { waitResponse };
}

function expectCode(res, codes, context) {
  const ok = Array.isArray(codes) ? codes.includes(res.code) : res.code === codes;
  if (!ok) {
    throw new SmtpError(
      `SMTP krok "${context}" zlyhal: ${res.lines.join(" | ")}`
    );
  }
  return res;
}

async function sendMail({ to, from, subject, text, replyTo }) {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "465", 10);
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;

  if (!host || !user || !password) {
    throw new Error(
      "Chýbajú SMTP_HOST / SMTP_USER / SMTP_PASSWORD premenné prostredia."
    );
  }

  const socket = await new Promise((resolve, reject) => {
    const s = tls.connect({ host, port, servername: host, timeout: 20000 }, () =>
      resolve(s)
    );
    s.once("error", reject);
    s.once("timeout", () => reject(new SmtpError("SMTP: časový limit pripojenia")));
  });

  const reader = createLineReader(socket);

  try {
    expectCode(await reader.waitResponse(), 220, "pripojenie");

    socket.write(`EHLO dosrdiecka.sk\r\n`);
    expectCode(await reader.waitResponse(), 250, "EHLO");

    socket.write(`AUTH LOGIN\r\n`);
    expectCode(await reader.waitResponse(), 334, "AUTH LOGIN");

    socket.write(`${b64(user)}\r\n`);
    expectCode(await reader.waitResponse(), 334, "SMTP prihlasovacie meno");

    socket.write(`${b64(password)}\r\n`);
    expectCode(await reader.waitResponse(), 235, "SMTP heslo (nesprávne prihlasovacie údaje?)");

    socket.write(`MAIL FROM:<${user}>\r\n`);
    expectCode(await reader.waitResponse(), [250], "MAIL FROM");

    socket.write(`RCPT TO:<${to}>\r\n`);
    expectCode(await reader.waitResponse(), [250, 251], "RCPT TO");

    socket.write(`DATA\r\n`);
    expectCode(await reader.waitResponse(), 354, "DATA");

    const headers = [
      `From: Do srdiečka <${user}>`,
      `To: <${to}>`,
      replyTo ? `Reply-To: <${replyTo}>` : null,
      `Subject: ${encodeSubject(subject)}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset=UTF-8`,
      `Content-Transfer-Encoding: base64`,
    ]
      .filter(Boolean)
      .join("\r\n");

    const body = encodeBodyBase64(text);
    // "dot-stuffing": riadok, ktorý by náhodou začínal bodkou, musí mať
    // pridanú druhú bodku, inak by ho SMTP omylom považoval za koniec správy.
    const safeBody = body
      .split("\r\n")
      .map((l) => (l.startsWith(".") ? "." + l : l))
      .join("\r\n");

    socket.write(`${headers}\r\n\r\n${safeBody}\r\n.\r\n`);
    expectCode(await reader.waitResponse(), 250, "odoslanie správy");

    socket.write(`QUIT\r\n`);
    await reader.waitResponse().catch(() => {});
  } finally {
    socket.end();
    socket.destroy();
  }
}

module.exports = { sendMail, SmtpError };
