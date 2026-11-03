import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { classify } = require("./intent.js");
const { execute } = require("./tools.cjs");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STATIC_ROOT = path.resolve(HERE, "..");
const WORK_ROOT = path.resolve(process.env.SILO_ROOT || STATIC_ROOT);
const HOST = "127.0.0.1";
const PREFIX = "/jarvis-os1";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

function insideStatic(urlPath) {
  const rel = urlPath.replace(/^\/+/, "");
  const file = path.resolve(STATIC_ROOT, rel);
  if (file !== STATIC_ROOT && !file.startsWith(STATIC_ROOT + path.sep)) return null;
  return file;
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 32000) {
      const error = new Error("large");
      error.code = "LARGE";
      throw error;
    }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function sendJson(res, status, body) {
  const raw = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(raw),
    "cache-control": "no-store",
  });
  res.end(raw);
}

export async function handle(req, res) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  if (req.method === "POST" && url.pathname === PREFIX + "/agent") {
    try {
      const body = await readJson(req);
      const order = classify(body.text || "");
      if (order.kind === "local") {
        sendJson(res, 200, { say: "Это я отвечу сам.", text: "Это я отвечу сам." });
        return;
      }
      const result = await execute(order, { root: WORK_ROOT });
      sendJson(res, 200, result);
    } catch {
      sendJson(res, 400, { say: "Не разобрал поручение.", text: "Не разобрал поручение." });
    }
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { allow: "GET, HEAD, POST" });
    res.end();
    return;
  }

  if (!url.pathname.startsWith(PREFIX)) {
    res.writeHead(404);
    res.end();
    return;
  }

  let rel = decodeURIComponent(url.pathname.slice(PREFIX.length));
  if (rel === "" || rel === "/") rel = "/index.html";
  const file = insideStatic(rel);
  if (!file) {
    res.writeHead(403);
    res.end();
    return;
  }
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(req.method === "HEAD" ? undefined : data);
  } catch {
    res.writeHead(404);
    res.end();
  }
}

export function start(port = 0) {
  const server = http.createServer((req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
  return new Promise((resolve) => {
    server.listen(port, HOST, () => resolve(server));
  });
}

const calledDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (calledDirectly) {
  const port = Number(process.env.PORT || 8787);
  start(port).then((server) => {
    const address = server.address();
    console.log("Сайло слушает http://" + HOST + ":" + address.port + PREFIX + "/");
    console.log("Файлы и команды — только в " + WORK_ROOT);
  });
}
