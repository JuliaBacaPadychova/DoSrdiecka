const test = require("node:test");
const assert = require("node:assert/strict");
const tls = require("tls");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const { sendMail } = require("../lib/mailer");

function makeSelfSignedCert() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dosrdiecka-cert-"));
  const keyPath = path.join(dir, "key.pem");
  const certPath = path.join(dir, "cert.pem");
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", keyPath, "-out", certPath,
    "-days", "1", "-subj", "/CN=127.0.0.1",
  ]);
  return {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  };
}

// Veľmi jednoduchý falošný SMTP server, ktorý odpovie ako skutočný SMTP
// server na implicitnom TLS (port 465) a zapamätá si, čo dostal — aby sme
// vedeli overiť, že náš ručne napísaný SMTP klient hovorí protokol správne.
function startFakeSmtpServer(tlsOpts) {
  const received = { authUser: null, authPass: null, mailFrom: null, rcptTo: null, dataLines: [] };
  let stage = "greet";
  let buffer = "";
  let inData = false;

  const server = tls.createServer(tlsOpts, (socket) => {
    socket.write("220 fake.smtp.local ESMTP\r\n");

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let idx;
      while ((idx = buffer.indexOf("\r\n")) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        handleLine(socket, line);
      }
    });
  });

  function handleLine(socket, line) {
    if (inData) {
      if (line === ".") {
        inData = false;
        socket.write("250 OK: message queued\r\n");
        return;
      }
      received.dataLines.push(line);
      return;
    }
    if (/^EHLO/i.test(line)) {
      socket.write("250-fake.smtp.local\r\n250 AUTH LOGIN\r\n");
    } else if (/^AUTH LOGIN/i.test(line)) {
      stage = "user";
      socket.write("334 VXNlcm5hbWU6\r\n");
    } else if (stage === "user") {
      received.authUser = Buffer.from(line, "base64").toString("utf8");
      stage = "pass";
      socket.write("334 UGFzc3dvcmQ6\r\n");
    } else if (stage === "pass") {
      received.authPass = Buffer.from(line, "base64").toString("utf8");
      stage = "done";
      socket.write("235 Authentication successful\r\n");
    } else if (/^MAIL FROM:/i.test(line)) {
      received.mailFrom = line;
      socket.write("250 OK\r\n");
    } else if (/^RCPT TO:/i.test(line)) {
      received.rcptTo = line;
      socket.write("250 OK\r\n");
    } else if (/^DATA/i.test(line)) {
      inData = true;
      socket.write("354 Start mail input\r\n");
    } else if (/^QUIT/i.test(line)) {
      socket.write("221 Bye\r\n");
      socket.end();
    } else {
      socket.write("250 OK\r\n");
    }
  }

  return { server, received };
}

test("sendMail sa úspešne prihlási cez AUTH LOGIN a odošle správu s diakritikou", async () => {
  const certs = makeSelfSignedCert();
  const { server, received } = startFakeSmtpServer(certs);

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  const prevReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // self-signed cert len pre tento test
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = String(port);
  process.env.SMTP_USER = "kolacik@dosrdiecka.sk";
  process.env.SMTP_PASSWORD = "tajneheslo123";

  try {
    await sendMail({
      to: "kolacik@dosrdiecka.sk",
      subject: "Nová objednávka na 2026-08-09",
      text: "Termín: 9. augusta\nMeno: Jana Nováková\nPoznámka: veterníky pistácia–malina",
    });
  } finally {
    if (prevReject === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = prevReject;
    await new Promise((resolve) => server.close(resolve));
  }

  assert.equal(received.authUser, "kolacik@dosrdiecka.sk");
  assert.equal(received.authPass, "tajneheslo123");
  assert.match(received.mailFrom, /^MAIL FROM:<kolacik@dosrdiecka\.sk>/);
  assert.match(received.rcptTo, /^RCPT TO:<kolacik@dosrdiecka\.sk>/);

  const bodyB64 = received.dataLines
    .slice(received.dataLines.indexOf("") + 1)
    .join("");
  const decoded = Buffer.from(bodyB64, "base64").toString("utf8");
  assert.match(decoded, /Jana Nováková/);
  assert.match(decoded, /pistácia–malina/);
});

test("sendMail odmietne s jasnou chybou, keď server vráti zlé heslo", async () => {
  const certs = makeSelfSignedCert();
  const server = tls.createServer(certs, (socket) => {
    socket.write("220 fake.smtp.local ESMTP\r\n");
    let buffer = "";
    let stage = "greet";
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let idx;
      while ((idx = buffer.indexOf("\r\n")) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        if (/^EHLO/i.test(line)) socket.write("250 fake.smtp.local\r\n");
        else if (/^AUTH LOGIN/i.test(line)) { stage = "user"; socket.write("334 VXNlcm5hbWU6\r\n"); }
        else if (stage === "user") { stage = "pass"; socket.write("334 UGFzc3dvcmQ6\r\n"); }
        else if (stage === "pass") { socket.write("535 Authentication failed\r\n"); }
      }
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  const prevReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = String(port);
  process.env.SMTP_USER = "kolacik@dosrdiecka.sk";
  process.env.SMTP_PASSWORD = "zle-heslo";

  try {
    await assert.rejects(
      () => sendMail({ to: "a@b.sk", subject: "test", text: "test" }),
      /SMTP heslo/
    );
  } finally {
    if (prevReject === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = prevReject;
    await new Promise((resolve) => server.close(resolve));
  }
});
