import nodemailer from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
}

export interface Mailer {
  send(msg: MailMessage): Promise<{ id: string }>;
}

/** SMTP (SMTP_URL, ex.: smtps://user:pass@smtp.exemplo.pt:465). */
export class SmtpMailer implements Mailer {
  private transport;
  constructor(url: string, private readonly from: string) {
    this.transport = nodemailer.createTransport(url);
  }
  async send(msg: MailMessage) {
    const r = await this.transport.sendMail({ from: this.from, ...msg });
    return { id: r.messageId };
  }
}

/** Mailer de desenvolvimento/testes: guarda as mensagens em memória e escreve um resumo no log. */
export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = [];
  async send(msg: MailMessage) {
    this.sent.push(msg);
    if (process.env.NODE_ENV !== 'test') console.log(`[mail] para ${msg.to}: ${msg.subject}`);
    return { id: `mem-${this.sent.length}` };
  }
}

let mailer: Mailer | undefined;
export function defaultMailer(): Mailer {
  if (mailer) return mailer;
  const url = process.env.SMTP_URL;
  mailer = url ? new SmtpMailer(url, process.env.MAIL_FROM ?? 'Somar <nao-responder@somar.pt>') : new MemoryMailer();
  return mailer;
}
export function setDefaultMailer(m: Mailer) {
  mailer = m;
}
