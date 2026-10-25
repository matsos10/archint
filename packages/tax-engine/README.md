# @somar/tax-engine

Motor fiscal e contabilístico português em TypeScript puro (sem UI, sem IA, sem base de dados).
Todos os valores legais vêm de `TaxParams` (validado por Zod), carregado da tabela `tax_parameter_sets`
e semeado a partir de `params/<ano>.json`. Montantes sempre em cêntimos (inteiros); arredondamento ao cêntimo no fim.

| Módulo | Função | Referência legal |
|---|---|---|
| `vat.ts` | `vatRatePct`, `checkDocumentVat`, `inferRateCode` | Art. 18.º CIVA |
| | `vatPeriodsForYear`, `vatDueDates`, `requiredVatPeriodicity` | Arts. 27.º e 41.º CIVA |
| | `assessArt53` | Art. 53.º CIVA |
| | `computeVatPeriod`, `computeVatYear` (liquidado − dedutível − reporte; campos do Q06) | Arts. 7.º, 8.º, 19.º–22.º CIVA |
| `irs.ts` | `simplifiedCoefficient` (coeficientes e redução de início) | Art. 31.º, n.ºs 1 e 10 CIRS |
| | `estimateIrs`: justificação dos 15%, englobamento, taxas gerais, solidariedade, deduções, mínimo de existência, retenções | Arts. 22.º, 25.º, 31.º n.º 13, 68.º, 68.º-A, 70.º, 78.º, 101.º, 102.º CIRS |
| | `withholdingFor`, `canClaimWithholdingExemption`, `irsPaymentsOnAccount` | Arts. 101.º, 101.º-B, 102.º CIRS |
| `social-security.ts` | `computeSocialSecurity` (rendimento relevante, base, taxa, mínimo, isenções, prazos) | Arts. 152.º–168.º Código dos Regimes Contributivos |
| `irc.ts` | `estimateIrc` (taxa PME/geral, derramas) | Arts. 87.º, 87.º-A CIRC; Lei 73/2013 |
| `regime-simulator.ts` | `compareIrsRegimes` (simplificado vs organizada) | Arts. 28.º, 31.º, 32.º CIRS |
| `calendar.ts` | `buildObligationCalendar` por tipo de conta | CIVA, CIRS, CIRC, CRC, DL 198/2012 |
| `holidays.ts` | feriados nacionais e transferência de prazos para dia útil | Art. 234.º CT; art. 20.º CPPT; art. 279.º CC |

Simplificações conhecidas (sinalizadas nas mensagens e em `ASSUNCOES.md`): tributação separada (sem quociente
conjugal), deduções à coleta parciais, mínimo de existência simplificado, IRC sem tributações autónomas nem prejuízos.
Os parâmetros com `"verify": true` estão por confirmar nas fontes oficiais (lista em `paramsToVerify()` e na área de administração).
