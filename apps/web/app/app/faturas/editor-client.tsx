'use client';

import { DocumentEditor, type EditorClient, type EditorValue } from '@/components/invoicing/document-editor';
import type { InvoiceContext, TaxParams } from '@somar/tax-engine';
import { saveInvoiceAction, saveQuoteAction } from './actions';

export function InvoiceEditor(props: { kind: 'invoice' | 'quote'; id?: string; params: TaxParams; context: Omit<InvoiceContext, 'clientHasOrganizedAccounting' | 'applyWithholding'>; clients: EditorClient[]; initial: EditorValue }) {
  return (
    <DocumentEditor
      kind={props.kind}
      params={props.params}
      context={props.context}
      clients={props.clients}
      initial={props.initial}
      submitLabel={props.id ? 'Guardar alterações' : 'Guardar rascunho'}
      onSave={async (payload) => {
        const input = { ...payload, notes: payload.notes, lines: payload.lines };
        const r = props.kind === 'invoice' ? await saveInvoiceAction(input, props.id) : await saveQuoteAction(input, props.id);
        return r && r.error ? { error: r.error } : undefined;
      }}
    />
  );
}
