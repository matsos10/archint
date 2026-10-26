// Etiquetas dos âmbitos para componentes de cliente (sem importar o pacote de servidor).
export const DELEGATION_SCOPES_UI = [
  { code: 'read', label: 'Consultar a contabilidade, faturas, justificativos e declarações' },
  { code: 'accounting', label: 'Corrigir categorias e confirmar justificativos' },
  { code: 'declarations', label: 'Preparar e confirmar declarações e registar a submissão' },
] as const;
