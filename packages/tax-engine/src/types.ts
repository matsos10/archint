/** Tipos de domínio do motor fiscal (independentes da base de dados e da UI). */

export type LegalForm = 'trabalhador_independente' | 'eni' | 'unipessoal_lda' | 'lda';
export type VatRegime = 'normal_mensal' | 'normal_trimestral' | 'isento_art53' | 'isento_art9';
export type IncomeTaxRegime = 'irs_simplificado' | 'irs_contabilidade_organizada' | 'irc_geral';
export type TaxRegion = 'continente' | 'madeira' | 'acores';

/** Tipo de rendimento da categoria B (determina o coeficiente do art. 31.º CIRS). */
export type IrsIncomeType =
  | 'servicos_tabela_151'
  | 'servicos_outros'
  | 'vendas'
  | 'hotelaria_restauracao'
  | 'propriedade_intelectual'
  | 'subsidios_exploracao'
  | 'subsidios_outros';

export const IRS_INCOME_TYPES: readonly IrsIncomeType[] = [
  'servicos_tabela_151',
  'servicos_outros',
  'vendas',
  'hotelaria_restauracao',
  'propriedade_intelectual',
  'subsidios_exploracao',
  'subsidios_outros',
];

export type VatRateCode = 'normal' | 'intermedia' | 'reduzida' | 'isenta' | 'nao_sujeita' | 'autoliquidacao';

/** Passo de cálculo, para explicar o resultado ao utilizador ("porque vou pagar isto?"). */
export interface Step {
  code: string;
  label: string;
  amountCents?: number;
  rate?: number;
  legalRef?: string;
  note?: string;
}

export const isIndividual = (lf: LegalForm) => lf === 'trabalhador_independente' || lf === 'eni';
