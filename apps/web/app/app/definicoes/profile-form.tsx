'use client';

import { useActionState } from 'react';
import { Field } from '@/components/ui/label';
import { Input, Select } from '@/components/ui/input';
import { FormError, SubmitButton } from '@/components/submit-button';
import { updateProfileAction } from './actions';

export interface ProfileValues {
  name: string;
  legalForm: string;
  nif: string;
  vatRegime: string;
  incomeTaxRegime: string;
  activityStartDate: string;
  cae: string;
  cirsActivityCode: string;
  hasEmploymentIncome: boolean;
  addressLine: string;
  postalCode: string;
  city: string;
  email: string;
}

export function ProfileForm({ account }: { account: ProfileValues }) {
  const [state, action] = useActionState(updateProfileAction, {});
  const individual = account.legalForm === 'trabalhador_independente' || account.legalForm === 'eni';
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-5 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <FormError message={state.error} />
        {state.ok && <p role="status" className="rounded-xl bg-success/10 px-4 py-3 text-sm text-success">{state.message}</p>}
      </div>
      <Field label="Nome" htmlFor="name" error={fe.name} className="sm:col-span-2">
        <Input id="name" name="name" defaultValue={account.name} required />
      </Field>
      <Field label={individual ? 'NIF' : 'NIPC'} htmlFor="nif" error={fe.nif}>
        <Input id="nif" name="nif" defaultValue={account.nif} inputMode="numeric" maxLength={9} />
      </Field>
      <Field label="Início de atividade" htmlFor="activityStartDate" error={fe.activityStartDate}>
        <Input id="activityStartDate" name="activityStartDate" type="date" defaultValue={account.activityStartDate} required />
      </Field>
      <Field label="Regime de IVA" htmlFor="vatRegime" error={fe.vatRegime}>
        <Select id="vatRegime" name="vatRegime" defaultValue={account.vatRegime}>
          {individual && <option value="isento_art53">Isento (art. 53.º)</option>}
          <option value="normal_trimestral">Normal trimestral</option>
          <option value="normal_mensal">Normal mensal</option>
          <option value="isento_art9">Isento (art. 9.º)</option>
        </Select>
      </Field>
      <Field label="Imposto sobre o rendimento" htmlFor="incomeTaxRegime" error={fe.incomeTaxRegime}>
        <Select id="incomeTaxRegime" name="incomeTaxRegime" defaultValue={account.incomeTaxRegime} disabled={!individual}>
          {individual ? (
            <>
              <option value="irs_simplificado">IRS — regime simplificado</option>
              <option value="irs_contabilidade_organizada">IRS — contabilidade organizada</option>
            </>
          ) : (
            <option value="irc_geral">IRC</option>
          )}
        </Select>
      </Field>
      <Field label="CAE" htmlFor="cae" error={fe.cae}>
        <Input id="cae" name="cae" defaultValue={account.cae} inputMode="numeric" maxLength={5} />
      </Field>
      {individual && (
        <Field label="Código art. 151.º CIRS" htmlFor="cirsActivityCode" error={fe.cirsActivityCode}>
          <Input id="cirsActivityCode" name="cirsActivityCode" defaultValue={account.cirsActivityCode} inputMode="numeric" maxLength={4} />
        </Field>
      )}
      <Field label="Morada" htmlFor="addressLine" className="sm:col-span-2">
        <Input id="addressLine" name="addressLine" defaultValue={account.addressLine} autoComplete="street-address" />
      </Field>
      <Field label="Código postal" htmlFor="postalCode" error={fe.postalCode}>
        <Input id="postalCode" name="postalCode" defaultValue={account.postalCode} placeholder="0000-000" autoComplete="postal-code" />
      </Field>
      <Field label="Localidade" htmlFor="city">
        <Input id="city" name="city" defaultValue={account.city} autoComplete="address-level2" />
      </Field>
      <Field label="Email para faturas" htmlFor="email" error={fe.email} className="sm:col-span-2">
        <Input id="email" name="email" type="email" defaultValue={account.email} />
      </Field>
      {individual && (
        <label className="flex items-center gap-3 text-sm sm:col-span-2">
          <input type="checkbox" name="hasEmploymentIncome" defaultChecked={account.hasEmploymentIncome} className="size-4 accent-[var(--primary)]" />
          Também trabalho por conta de outrem
        </label>
      )}
      <div className="sm:col-span-2">
        <SubmitButton pendingText="A guardar…">Guardar alterações</SubmitButton>
      </div>
    </form>
  );
}
