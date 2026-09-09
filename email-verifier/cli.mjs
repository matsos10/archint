#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { verifyEmail } from './lib/verifyEmail.mjs';

function parseArgs(argv) {
  const args = { emails: [], file: null, json: false, noSmtp: false, noCatchAll: false, from: 'verify@example.com', timeout: 8000, port: 25, concurrency: 5 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file') args.file = argv[++i];
    else if (a === '--json') args.json = true;
    else if (a === '--no-smtp') args.noSmtp = true;
    else if (a === '--no-catch-all') args.noCatchAll = true;
    else if (a === '--from') args.from = argv[++i];
    else if (a === '--timeout') args.timeout = parseInt(argv[++i], 10);
    else if (a === '--port') args.port = parseInt(argv[++i], 10);
    else if (a === '--concurrency') args.concurrency = parseInt(argv[++i], 10);
    else if (a === '--help' || a === '-h') args.help = true;
    else args.emails.push(a);
  }
  return args;
}

function printHelp() {
  console.log(`Usage: node cli.mjs [emails...] [options]

Options:
  --file <path>        Read emails from a file (one per line, blank lines ignored)
  --json                Print raw JSON instead of a table
  --no-smtp             Skip the SMTP handshake (syntax + MX + disposable check only)
  --no-catch-all        Skip the catch-all probe (faster, less accurate)
  --from <address>      MAIL FROM address used during the SMTP check (default: verify@example.com)
  --timeout <ms>        SMTP connection timeout in ms (default: 8000)
  --port <n>            SMTP port to use (default: 25)
  --concurrency <n>     Parallel checks when verifying multiple emails (default: 5)

Examples:
  node cli.mjs someone@example.com
  node cli.mjs --file emails.txt --json > results.json
  node cli.mjs someone@example.com --no-smtp   # use when outbound port 25 is blocked
`);
}

async function runPool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

function printTable(results) {
  const rows = results.map((r) => ({
    email: r.email,
    status: r.status,
    reason: r.reason,
    score: r.score,
    mx: r.hasMxRecords ? 'yes' : 'no',
    disposable: r.disposable ? 'yes' : 'no',
    role: r.roleAccount ? 'yes' : 'no',
    catchAll: r.catchAll === null ? '-' : r.catchAll ? 'yes' : 'no',
  }));
  console.table(rows);
}

const args = parseArgs(process.argv.slice(2));

if (args.help || (!args.emails.length && !args.file)) {
  printHelp();
  process.exit(args.help ? 0 : 1);
}

const emails = [...args.emails];
if (args.file) {
  const content = readFileSync(args.file, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed && trimmed.toLowerCase() !== 'email') emails.push(trimmed);
  }
}

const options = {
  checkSmtp: !args.noSmtp,
  checkCatchAll: !args.noCatchAll,
  fromAddress: args.from,
  timeoutMs: args.timeout,
  smtpPort: args.port,
};

const results = await runPool(emails, args.concurrency, (email) => verifyEmail(email, options));

if (args.json) {
  console.log(JSON.stringify(results, null, 2));
} else {
  printTable(results);
}
