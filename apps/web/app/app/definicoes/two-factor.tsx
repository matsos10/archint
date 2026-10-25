'use client';

import { useActionState, useState, useTransition } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { FormError, SubmitButton } from '@/components/submit-button';
import { beginTotpAction, confirmTotpAction, disableTotpAction } from './actions';

export function TwoFactorSettings({ enabled }: { enabled: boolean }) {
  const [setup, setSetup] = useState<{ qr?: string; secret?: string }>();
  const [codes, setCodes] = useState<string[]>();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const [disableState, disableAction] = useActionState(disableTotpAction, {});

  if (codes) {
    return (
      <div className="grid gap-4">
        <p className="flex items-center gap-2 font-medium text-success">
          <ShieldCheck className="size-5" /> Autenticação de dois fatores ativa.
        </p>
        <p className="text-sm text-muted-foreground">
          Guarda estes códigos de recuperação num local seguro. Cada um só pode ser usado uma vez e não voltarão a ser mostrados.
        </p>
        <ul className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-4 font-mono text-sm sm:grid-cols-5">
          {codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </div>
    );
  }

  if (enabled) {
    return (
      <form action={disableAction} className="grid gap-4">
        <p className="flex items-center gap-2 font-medium">
          <ShieldCheck className="size-5 text-success" /> Autenticação de dois fatores ativa.
        </p>
        <FormError message={disableState.error} />
        <Field label="Palavra-passe, para desativar" htmlFor="pw">
          <Input id="pw" name="password" type="password" autoComplete="current-password" required className="max-w-sm" />
        </Field>
        <div>
          <SubmitButton variant="outline">Desativar 2FA</SubmitButton>
        </div>
      </form>
    );
  }

  if (!setup) {
    return (
      <div className="grid gap-4">
        <p className="text-sm text-muted-foreground">Usa uma app como Google Authenticator, Microsoft Authenticator ou 1Password.</p>
        <FormError message={error} />
        <div>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await beginTotpAction();
                if (r.error) setError(r.error);
                else setSetup(r);
              })
            }
          >
            Ativar autenticação de dois fatores
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-5 sm:grid-cols-[220px_1fr] sm:items-start">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={setup.qr} alt="Código QR para a app de autenticação" width={220} height={220} className="rounded-xl border bg-white p-2" />
      <div className="grid gap-4">
        <p className="text-sm">
          1. Lê o código QR com a tua app. Se não conseguires, introduz a chave:{' '}
          <code className="break-all rounded bg-muted px-1.5 py-0.5 text-xs">{setup.secret}</code>
        </p>
        <p className="text-sm">2. Escreve o código de 6 dígitos que aparece na app.</p>
        <FormError message={error} />
        <Field label="Código" htmlFor="totp">
          <Input id="totp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="max-w-40 text-center tracking-[0.3em] tabular" />
        </Field>
        <div>
          <Button
            disabled={pending || code.length !== 6}
            onClick={() =>
              start(async () => {
                const r = await confirmTotpAction(code);
                if (r.error) setError(r.error);
                else setCodes(r.recoveryCodes);
              })
            }
          >
            Confirmar
          </Button>
        </div>
      </div>
    </div>
  );
}
