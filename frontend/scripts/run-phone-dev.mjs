import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const certDir = path.join(root, "certificates");
const keyPath = path.join(certDir, "localhost-key.pem");
const certPath = path.join(certDir, "localhost.pem");
const HTTP_PORT = 3000;
const HTTPS_PORT = 3443;

function hasUsableCerts() {
  try {
    return (
      fs.existsSync(keyPath) &&
      fs.existsSync(certPath) &&
      fs.statSync(keyPath).size > 0 &&
      fs.statSync(certPath).size > 0
    );
  } catch {
    return false;
  }
}

function ensureCerts() {
  const script = path.join(root, "scripts", "generate-phone-https-cert.py");
  // Always refresh SANs so the current LAN IP is covered.
  const result = spawnSync("python", [script], { stdio: "inherit", cwd: root, shell: true });
  if (result.status !== 0 || !hasUsableCerts()) {
    console.error(
      "Could not generate HTTPS certs. Install Python cryptography (`pip install cryptography`) or use an HTTPS tunnel (ngrok http 3000).",
    );
    process.exit(1);
  }
}

function pickLanIp() {
  const nets = os.networkInterfaces();
  const preferred = [];
  const fallback = [];
  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family !== "IPv4" && entry.family !== 4) continue;
      if (entry.internal) continue;
      if (entry.address.startsWith("192.168.") || entry.address.startsWith("10.")) {
        preferred.push(entry.address);
      } else {
        fallback.push(entry.address);
      }
    }
  }
  return preferred[0] ?? fallback[0] ?? "127.0.0.1";
}

function waitForPort(port, host = "127.0.0.1", timeoutMs = 60000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const socket = net.connect({ port, host }, () => {
        socket.end();
        resolve();
      });
      socket.on("error", () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timed out waiting for ${host}:${port}`));
          return;
        }
        setTimeout(tryOnce, 400);
      });
    };
    tryOnce();
  });
}

function pipe(req, res, options) {
  const upstream = http.request(options, (upRes) => {
    res.writeHead(upRes.statusCode ?? 502, upRes.headers);
    upRes.pipe(res);
  });
  upstream.on("error", (err) => {
    console.error("Proxy error:", err.message);
    if (!res.headersSent) res.writeHead(502);
    res.end("Bad gateway");
  });
  req.pipe(upstream);
}

function startHttpsProxy() {
  const server = https.createServer(
    {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    },
    (req, res) => {
      const headers = { ...req.headers, host: `127.0.0.1:${HTTP_PORT}` };
      pipe(req, res, {
        hostname: "127.0.0.1",
        port: HTTP_PORT,
        path: req.url,
        method: req.method,
        headers,
      });
    },
  );

  server.on("upgrade", (req, socket, head) => {
    const upstream = net.connect(HTTP_PORT, "127.0.0.1", () => {
      const reqLine = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
      const headerLines = Object.entries(req.headers)
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
        .join("\r\n");
      upstream.write(`${reqLine}${headerLines}\r\n\r\n`);
      if (head.length) upstream.write(head);
      socket.pipe(upstream);
      upstream.pipe(socket);
    });
    upstream.on("error", () => socket.destroy());
    socket.on("error", () => upstream.destroy());
  });

  server.listen(HTTPS_PORT, "0.0.0.0");
  return server;
}

ensureCerts();
const lanIp = pickLanIp();

console.log("Starting Next.js on http://127.0.0.1:3000 …");
const nextProc = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["next", "dev", "--webpack", "-H", "127.0.0.1", "-p", String(HTTP_PORT)],
  { cwd: root, stdio: "inherit", env: process.env, shell: true },
);

nextProc.on("exit", (code) => {
  console.error("Next.js exited", code);
  process.exit(code ?? 1);
});

await waitForPort(HTTP_PORT);
startHttpsProxy();

console.log("");
console.log("Phone AR (Android Chrome + ARCore):");
console.log(`  https://${lanIp}:${HTTPS_PORT}/webxr`);
console.log("Accept the certificate warning, allow camera, then Enter AR.");
console.log("Keep the API on :8000 and NEXT_PUBLIC_API_BASE_URL=/api.");
console.log("iPhone Safari cannot run WebXR AR.");
console.log("");

const shutdown = () => {
  nextProc.kill("SIGTERM");
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
