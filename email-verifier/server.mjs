import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyEmail } from './lib/verifyEmail.mjs';
import { runPool } from './lib/pool.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3300;
const MAX_EMAILS = 200;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

async function serveStatic(req, res) {
  const filePath = req.url === '/' ? '/index.html' : req.url;
  const resolved = path.join(PUBLIC_DIR, filePath);
  if (!resolved.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const data = await readFile(resolved);
    const ext = path.extname(resolved);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404).end('Not found');
  }
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error('payload-too-large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

async function handleVerify(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'invalid-json' }));
    return;
  }

  const emails = Array.isArray(body.emails) ? body.emails.map(String).filter(Boolean) : [];
  if (!emails.length) {
    res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'no-emails' }));
    return;
  }
  if (emails.length > MAX_EMAILS) {
    res.writeHead(400, { 'Content-Type': 'application/json' }).end(
      JSON.stringify({ error: `too-many-emails (max ${MAX_EMAILS})` }),
    );
    return;
  }

  const options = {
    checkSmtp: body.checkSmtp !== false,
    checkCatchAll: body.checkCatchAll !== false,
    fromAddress: typeof body.fromAddress === 'string' && body.fromAddress ? body.fromAddress : 'verify@example.com',
    timeoutMs: Number.isFinite(body.timeoutMs) ? body.timeoutMs : 8000,
    smtpPort: Number.isFinite(body.smtpPort) ? body.smtpPort : 25,
  };

  const results = await runPool(emails, 5, (email) => verifyEmail(email, options));
  res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ results }));
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/verify') {
    handleVerify(req, res).catch(() => res.writeHead(500).end('Internal error'));
    return;
  }
  if (req.method === 'GET') {
    serveStatic(req, res);
    return;
  }
  res.writeHead(404).end('Not found');
});

server.listen(PORT, () => {
  console.log(`Email verifier UI running at http://localhost:${PORT}`);
});
