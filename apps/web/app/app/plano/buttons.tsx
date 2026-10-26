'use client';

import { useActionState } from 'react';
import { FormError, SubmitButton } from '@/components/submit-button';
import { checkoutAction, portalAction } from './actions';

export function CheckoutButton({ planCode, interval, label, disabled }: { planCode: string; interval: 'month' | 'year'; label: string; disabled?: boolean }) {
  const [state, action] = useActionState(checkoutAction.bind(null, planCode, interval), {});
  return (
    <form action={action} className="grid gap-2">
      <FormError message={state.error} />
      <SubmitButton className="w-full" disabled={disabled} pendingText="A abrir o pagamento…">
        {label}
      </SubmitButton>
    </form>
  );
}

export function PortalButton() {
  const [state, action] = useActionState(portalAction, {});
  return (
    <form action={action} className="grid gap-2">
      <FormError message={state.error} />
      <SubmitButton variant="outline" pendingText="A abrir…">
        Gerir subscrição, cartão e faturas
      </SubmitButton>
    </form>
  );
}
