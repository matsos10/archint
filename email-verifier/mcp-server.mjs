#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { verifyEmail } from './lib/verifyEmail.mjs';
import { runPool } from './lib/pool.mjs';

const MAX_BATCH = 50;

const server = new McpServer({
  name: 'email-verifier',
  version: '1.0.0',
});

server.registerTool(
  'verify_email',
  {
    title: 'Verify a single email address',
    description:
      "Checks whether an email address is deliverable: syntax validation, MX record lookup, " +
      "disposable-domain and role-account detection, and (unless disabled) a live SMTP RCPT TO " +
      "handshake with catch-all detection, similar to Hunter.io's email verifier. " +
      "Note: the SMTP check requires outbound TCP on the SMTP port (25 by default) — if that's " +
      "blocked on the host network, set checkSmtp to false to fall back to syntax/MX/disposable checks only.",
    inputSchema: {
      email: z.string().describe('The email address to verify, e.g. "jane@example.com"'),
      checkSmtp: z.boolean().default(true).describe('Perform a live SMTP RCPT TO handshake against the domain\'s mail server'),
      checkCatchAll: z.boolean().default(true).describe('Probe the domain with a random address to detect catch-all mail servers'),
      timeoutMs: z.number().int().positive().default(8000).describe('SMTP connection timeout in milliseconds'),
      smtpPort: z.number().int().positive().default(25).describe('SMTP port to connect to'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async ({ email, checkSmtp, checkCatchAll, timeoutMs, smtpPort }) => {
    const result = await verifyEmail(email, { checkSmtp, checkCatchAll, timeoutMs, smtpPort });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  },
);

server.registerTool(
  'verify_emails',
  {
    title: 'Verify a batch of email addresses',
    description:
      `Runs verify_email over a list of up to ${MAX_BATCH} email addresses in parallel and returns ` +
      'the results as a list, in the same order as the input.',
    inputSchema: {
      emails: z.array(z.string()).min(1).max(MAX_BATCH).describe(`Email addresses to verify (max ${MAX_BATCH})`),
      checkSmtp: z.boolean().default(true),
      checkCatchAll: z.boolean().default(true),
      timeoutMs: z.number().int().positive().default(8000),
      smtpPort: z.number().int().positive().default(25),
      concurrency: z.number().int().positive().max(10).default(5),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async ({ emails, checkSmtp, checkCatchAll, timeoutMs, smtpPort, concurrency }) => {
    const results = await runPool(emails, concurrency, (email) =>
      verifyEmail(email, { checkSmtp, checkCatchAll, timeoutMs, smtpPort }),
    );
    return {
      content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
      structuredContent: { results },
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
