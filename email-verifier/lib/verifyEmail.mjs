import dns from 'node:dns/promises';
import net from 'node:net';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const disposableDomains = new Set(
  JSON.parse(readFileSync(path.join(__dirname, '../data/disposable-domains.json'), 'utf8')),
);

const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

const ROLE_LOCAL_PARTS = new Set([
  'admin', 'administrator', 'support', 'info', 'contact', 'sales',
  'marketing', 'help', 'billing', 'no-reply', 'noreply', 'postmaster',
  'webmaster', 'abuse', 'security', 'hostmaster', 'root', 'office',
]);

function randomLocalPart() {
  return 'verify-' + Math.random().toString(36).slice(2, 12);
}

async function getMxHosts(domain) {
  try {
    const records = await dns.resolveMx(domain);
    if (records.length) {
      return records.sort((a, b) => a.priority - b.priority).map((r) => r.exchange);
    }
  } catch {
    // no MX records, fall through to A/AAAA fallback below
  }
  try {
    await dns.resolve(domain);
    return [domain];
  } catch {
    return [];
  }
}

// Speaks just enough SMTP (EHLO/MAIL FROM/RCPT TO) to see whether the
// server would accept the address, then quits without sending anything.
function smtpCheck(host, email, { fromAddress, timeoutMs, port }) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port, timeout: timeoutMs });
    let stage = 'connect';
    let buffer = '';

    const finish = (result) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.on('timeout', () => finish({ ok: false, stage, code: null, reason: 'timeout' }));
    socket.on('error', (err) => finish({ ok: false, stage, code: null, reason: err.code || err.message }));

    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      if (!buffer.endsWith('\r\n')) return;
      const lines = buffer.trim().split('\r\n');
      const code = parseInt(lines[lines.length - 1].slice(0, 3), 10);
      buffer = '';

      if (stage === 'connect') {
        if (code !== 220) return finish({ ok: false, stage, code, reason: 'no-greeting' });
        stage = 'ehlo';
        socket.write('EHLO verifier.local\r\n');
      } else if (stage === 'ehlo') {
        if (code !== 250) return finish({ ok: false, stage, code, reason: 'ehlo-rejected' });
        stage = 'mail';
        socket.write(`MAIL FROM:<${fromAddress}>\r\n`);
      } else if (stage === 'mail') {
        if (code !== 250) return finish({ ok: false, stage, code, reason: 'mail-from-rejected' });
        stage = 'rcpt';
        socket.write(`RCPT TO:<${email}>\r\n`);
      } else if (stage === 'rcpt') {
        socket.write('QUIT\r\n');
        finish({ ok: code === 250, stage, code, reason: code === 250 ? 'accepted' : 'rejected' });
      }
    });
  });
}

export async function verifyEmail(email, options = {}) {
  const {
    checkSmtp = true,
    checkCatchAll = true,
    fromAddress = 'verify@example.com',
    timeoutMs = 8000,
    smtpPort = 25,
  } = options;

  const result = {
    email,
    syntaxValid: false,
    localPart: null,
    domain: null,
    disposable: false,
    roleAccount: false,
    hasMxRecords: false,
    mxHosts: [],
    smtp: null,
    catchAll: null,
    status: 'invalid',
    reason: 'invalid-syntax',
    score: 0,
  };

  if (!EMAIL_REGEX.test(email)) {
    return result;
  }
  result.syntaxValid = true;

  const at = email.lastIndexOf('@');
  result.localPart = email.slice(0, at);
  result.domain = email.slice(at + 1).toLowerCase();
  result.roleAccount = ROLE_LOCAL_PARTS.has(result.localPart.toLowerCase());
  result.disposable = disposableDomains.has(result.domain);

  const mxHosts = await getMxHosts(result.domain);
  result.hasMxRecords = mxHosts.length > 0;
  result.mxHosts = mxHosts;

  if (!result.hasMxRecords) {
    result.status = 'invalid';
    result.reason = 'no-mx-records';
    result.score = 0;
    return result;
  }

  if (!checkSmtp) {
    result.status = result.disposable ? 'risky' : 'unknown';
    result.reason = result.disposable ? 'disposable-domain' : 'smtp-check-skipped';
    result.score = result.disposable ? 40 : 55;
    return result;
  }

  const host = mxHosts[0];
  const smtpResult = await smtpCheck(host, email, { fromAddress, timeoutMs, port: smtpPort });
  result.smtp = smtpResult;

  if (!smtpResult.ok && smtpResult.stage !== 'rcpt') {
    result.status = 'unknown';
    result.reason = `smtp-${smtpResult.reason}`;
    result.score = 30;
    return result;
  }

  if (checkCatchAll) {
    const probeEmail = `${randomLocalPart()}@${result.domain}`;
    const catchAllResult = await smtpCheck(host, probeEmail, { fromAddress, timeoutMs, port: smtpPort });
    result.catchAll = catchAllResult.ok;
  }

  if (!smtpResult.ok) {
    result.status = 'invalid';
    result.reason = `rejected-${smtpResult.code ?? smtpResult.reason}`;
    result.score = 5;
  } else if (result.catchAll) {
    result.status = 'risky';
    result.reason = 'catch-all-domain';
    result.score = 50;
  } else if (result.disposable) {
    result.status = 'risky';
    result.reason = 'disposable-domain';
    result.score = 35;
  } else if (result.roleAccount) {
    result.status = 'risky';
    result.reason = 'role-account';
    result.score = 65;
  } else {
    result.status = 'valid';
    result.reason = 'accepted';
    result.score = 95;
  }

  return result;
}
