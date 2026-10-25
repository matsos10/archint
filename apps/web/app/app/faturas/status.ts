export const INVOICE_STATUS: Record<string, { label: string; variant: 'muted' | 'default' | 'success' | 'warning' | 'destructive' }> = {
  draft: { label: 'Rascunho', variant: 'muted' },
  issued: { label: 'Emitida', variant: 'default' },
  sent: { label: 'Enviada', variant: 'default' },
  partially_paid: { label: 'Paga em parte', variant: 'warning' },
  paid: { label: 'Paga', variant: 'success' },
  cancelled: { label: 'Anulada', variant: 'muted' },
  overdue: { label: 'Em atraso', variant: 'destructive' },
};

export const QUOTE_STATUS: Record<string, { label: string; variant: 'muted' | 'default' | 'success' | 'warning' | 'destructive' }> = {
  draft: { label: 'Rascunho', variant: 'muted' },
  sent: { label: 'Enviado', variant: 'default' },
  accepted: { label: 'Aceite', variant: 'success' },
  rejected: { label: 'Recusado', variant: 'destructive' },
  expired: { label: 'Expirado', variant: 'muted' },
  invoiced: { label: 'Faturado', variant: 'success' },
};
