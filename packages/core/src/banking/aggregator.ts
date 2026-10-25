import type { ParsedTransaction } from './parsers';

/**
 * Agregador de open banking (PSD2, só leitura). O utilizador autentica-se no próprio banco através
 * do agregador; a Somar só guarda a referência do consentimento — nunca credenciais bancárias.
 */
export interface Institution {
  id: string;
  name: string;
  logo?: string;
  bic?: string;
}

export interface LinkStatus {
  status: 'pending' | 'linked' | 'expired' | 'revoked' | 'error';
  accountIds: string[];
  consentExpiresAt?: Date;
}

export interface AggregatorAccount {
  id: string;
  iban?: string;
  name?: string;
  currency: string;
  balanceCents?: number;
}

export interface BankAggregator {
  readonly name: string;
  listInstitutions(country: string): Promise<Institution[]>;
  createLink(input: { institutionId: string; redirectUrl: string; reference: string; historyDays?: number }): Promise<{ externalRef: string; link: string }>;
  getLinkStatus(externalRef: string): Promise<LinkStatus>;
  getAccount(accountId: string): Promise<AggregatorAccount>;
  getTransactions(accountId: string, opts: { dateFrom?: string }): Promise<ParsedTransaction[]>;
  revokeLink?(externalRef: string): Promise<void>;
}

type Fetch = typeof fetch;

/** GoCardless Bank Account Data (ex-Nordigen), API v2. */
export class GoCardlessAggregator implements BankAggregator {
  readonly name = 'gocardless';
  private token?: { access: string; expiresAt: number };

  constructor(
    private readonly cfg: { secretId: string; secretKey: string; baseUrl?: string; timeoutMs?: number },
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  private get base() {
    return this.cfg.baseUrl ?? 'https://bankaccountdata.gocardless.com/api/v2';
  }

  private async request<T>(path: string, init: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json', 'content-type': 'application/json' };
    if (init.auth !== false) headers.authorization = `Bearer ${await this.accessToken()}`;
    const res = await this.fetchImpl(`${this.base}${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(this.cfg.timeoutMs ?? 20_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`GoCardless ${res.status} em ${path}: ${text.slice(0, 300)}`);
    }
    return (await res.json()) as T;
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.access;
    const t = await this.request<{ access: string; access_expires: number }>('/token/new/', {
      method: 'POST',
      body: { secret_id: this.cfg.secretId, secret_key: this.cfg.secretKey },
      auth: false,
    });
    this.token = { access: t.access, expiresAt: Date.now() + t.access_expires * 1000 };
    return t.access;
  }

  async listInstitutions(country: string) {
    const list = await this.request<{ id: string; name: string; logo?: string; bic?: string }[]>(`/institutions/?country=${encodeURIComponent(country.toLowerCase())}`);
    return list.map((i) => ({ id: i.id, name: i.name, logo: i.logo, bic: i.bic }));
  }

  async createLink(input: { institutionId: string; redirectUrl: string; reference: string; historyDays?: number }) {
    const agreement = await this.request<{ id: string }>('/agreements/enduser/', {
      method: 'POST',
      body: {
        institution_id: input.institutionId,
        max_historical_days: input.historyDays ?? 365,
        access_valid_for_days: 90,
        access_scope: ['balances', 'details', 'transactions'],
      },
    });
    const req = await this.request<{ id: string; link: string }>('/requisitions/', {
      method: 'POST',
      body: { redirect: input.redirectUrl, institution_id: input.institutionId, reference: input.reference, agreement: agreement.id, user_language: 'PT' },
    });
    return { externalRef: req.id, link: req.link };
  }

  async getLinkStatus(externalRef: string): Promise<LinkStatus> {
    const r = await this.request<{ status: string; accounts: string[] }>(`/requisitions/${externalRef}/`);
    // Estados GoCardless: CR (criado), GC, UA, GA, SA (em curso), LN (ligado), EX (expirado), RJ (rejeitado), SU (suspenso)
    const map: Record<string, LinkStatus['status']> = { LN: 'linked', EX: 'expired', RJ: 'error', SU: 'revoked' };
    return { status: map[r.status] ?? 'pending', accountIds: r.accounts ?? [] };
  }

  async getAccount(accountId: string): Promise<AggregatorAccount> {
    const d = await this.request<{ account: { iban?: string; name?: string; ownerName?: string; currency?: string } }>(`/accounts/${accountId}/details/`);
    let balanceCents: number | undefined;
    try {
      const b = await this.request<{ balances: { balanceAmount: { amount: string }; balanceType: string }[] }>(`/accounts/${accountId}/balances/`);
      const pick = b.balances.find((x) => x.balanceType === 'interimAvailable' || x.balanceType === 'closingBooked') ?? b.balances[0];
      if (pick) balanceCents = Math.round(Number(pick.balanceAmount.amount) * 100);
    } catch {
      // saldo é opcional
    }
    return { id: accountId, iban: d.account.iban, name: d.account.name ?? d.account.ownerName, currency: d.account.currency ?? 'EUR', balanceCents };
  }

  async getTransactions(accountId: string, opts: { dateFrom?: string }) {
    const q = opts.dateFrom ? `?date_from=${opts.dateFrom}` : '';
    const r = await this.request<{
      transactions: {
        booked: {
          transactionId?: string;
          internalTransactionId?: string;
          bookingDate?: string;
          valueDate?: string;
          transactionAmount: { amount: string; currency: string };
          remittanceInformationUnstructured?: string;
          remittanceInformationUnstructuredArray?: string[];
          creditorName?: string;
          debtorName?: string;
        }[];
      };
    }>(`/accounts/${accountId}/transactions/${q}`);
    return r.transactions.booked
      .filter((t) => t.bookingDate || t.valueDate)
      .map((t) => {
        const amountCents = Math.round(Number(t.transactionAmount.amount) * 100);
        const counterparty = amountCents < 0 ? t.creditorName : t.debtorName;
        const info = t.remittanceInformationUnstructured ?? t.remittanceInformationUnstructuredArray?.join(' ');
        return {
          bookingDate: (t.bookingDate ?? t.valueDate)!,
          valueDate: t.valueDate,
          amountCents,
          currency: t.transactionAmount.currency,
          description: [counterparty, info].filter(Boolean).join(' ') || '(sem descrição)',
          counterparty,
          externalId: t.transactionId ?? t.internalTransactionId,
        };
      });
  }

  async revokeLink(externalRef: string) {
    await this.request(`/requisitions/${externalRef}/`, { method: 'DELETE' });
  }
}

/** Agregador simulado para desenvolvimento e testes (banco fictício, dados determinísticos). */
export class MockAggregator implements BankAggregator {
  readonly name = 'mock';
  private links = new Map<string, { status: LinkStatus['status'] }>();

  constructor(private readonly txs: Record<string, ParsedTransaction[]> = {}) {}

  async listInstitutions() {
    return [{ id: 'SOMAR_BANCO_DEMO', name: 'Banco Demonstração (simulado)' }];
  }

  async createLink(input: { institutionId: string; redirectUrl: string; reference: string }) {
    const externalRef = `mock-${input.reference}`;
    this.links.set(externalRef, { status: 'linked' });
    const url = new URL(input.redirectUrl);
    url.searchParams.set('ref', input.reference);
    return { externalRef, link: url.toString() };
  }

  async getLinkStatus(externalRef: string): Promise<LinkStatus> {
    const l = this.links.get(externalRef) ?? { status: 'linked' as const };
    return { status: l.status, accountIds: l.status === 'linked' ? [`${externalRef}-acc1`] : [] };
  }

  async getAccount(accountId: string) {
    return { id: accountId, iban: 'PT50000201231234567890154', name: 'Conta à ordem (demo)', currency: 'EUR', balanceCents: 250000 };
  }

  async getTransactions(accountId: string, opts: { dateFrom?: string }) {
    const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
    const list = this.txs[accountId] ?? [
      { bookingDate: daysAgo(20), description: 'DD MEO FATURA', amountCents: -4920, externalId: `${accountId}-1` },
      { bookingDate: daysAgo(12), description: 'TRF CLIENTE EXEMPLO LDA', amountCents: 123000, externalId: `${accountId}-2` },
    ];
    return list.filter((t) => !opts.dateFrom || t.bookingDate >= opts.dateFrom);
  }
}

let aggregator: BankAggregator | undefined;

/** Agregador configurado: GoCardless se houver credenciais; senão o simulado (só fora de produção). */
export function defaultAggregator(): BankAggregator | null {
  if (aggregator) return aggregator;
  const id = process.env.GOCARDLESS_SECRET_ID;
  const key = process.env.GOCARDLESS_SECRET_KEY;
  if (id && key) aggregator = new GoCardlessAggregator({ secretId: id, secretKey: key });
  else if (process.env.BANK_PROVIDER === 'mock' || process.env.NODE_ENV !== 'production') aggregator = new MockAggregator();
  return aggregator ?? null;
}

export function setDefaultAggregator(a: BankAggregator) {
  aggregator = a;
}
