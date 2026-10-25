# Caso de referência — ENI, regime simplificado, IVA trimestral (2025)

**Marta Ferreira — Design Gráfico**, ENI, NIF 234567899 (fictício), início de atividade 01/09/2022, Porto (continente),
rendimentos da tabela do art. 151.º CIRS (coeficiente 0,75), IVA normal trimestral, sem trabalho dependente.

| Ficheiro | Conteúdo |
|---|---|
| `conta.json` | Perfil da conta (onboarding) |
| `clientes.json` | 4 clientes (3 empresas com contabilidade organizada, 1 particular) |
| `faturas.json` | 8 faturas emitidas em 2025 (IVA 23%; retenção 23% nas empresas) |
| `extrato-bancario-2025.csv` | 93 movimentos (formato de banco português: `;`, `dd-mm-aaaa`, vírgula decimal) |
| `justificativos.json` | 43 justificativos de despesas (dados que o OCR deve extrair) |
| `categorizacao-esperada.json` | Categoria correta de cada movimento, duplicado e justificativo em falta |
| `ano-anterior.json` | Dados de 2024 necessários (rendimentos T3/T4 para a Segurança Social, deduções) |

Casos especiais: **t061** (cabos, 43,05 €, 22/08) não tem justificativo → IVA não dedutível e alerta;
o débito **MEO de 08/04** aparece duas vezes (importação duplicada) → deve ser detetado e excluído.
A fatura **FT 2025A/8** (19/12) ainda não foi paga no fim do ano.

## Faturas

| N.º | Data | Cliente | Base | IVA 23% | Retenção 23% | Recebido |
|---|---|---|---:|---:|---:|---:|
| 1 | 31/01 | Atlântico Software | 3 000,00 | 690,00 | 690,00 | 3 000,00 |
| 2 | 15/03 | Padaria Lusa | 1 800,00 | 414,00 | 414,00 | 1 800,00 |
| 3 | 30/04 | Atlântico Software | 6 000,00 | 1 380,00 | 1 380,00 | 6 000,00 |
| 4 | 20/06 | Hotel Ribeira | 4 500,00 | 1 035,00 | 1 035,00 | 4 500,00 |
| 5 | 31/07 | Atlântico Software | 6 000,00 | 1 380,00 | 1 380,00 | 6 000,00 |
| 6 | 12/09 | João Mendes (particular) | 1 200,00 | 276,00 | — | 1 476,00 |
| 7 | 31/10 | Hotel Ribeira | 7 500,00 | 1 725,00 | 1 725,00 | 7 500,00 |
| 8 | 19/12 | Padaria Lusa | 2 400,00 | 552,00 | 552,00 | (por receber) |
| | | **Total** | **32 400,00** | **7 452,00** | **7 176,00** | |

## IVA (arts. 19.º–22.º, 27.º, 41.º CIVA)

IVA dedutível mensal com justificativo: software 11,50 + telecomunicações 9,20 + coworking 34,50 = 55,20 € (165,60 € por trimestre).

| Trimestre | Liquidado | Dedutível | Detalhe do dedutível | A pagar | Prazo pagamento |
|---|---:|---:|---|---:|---|
| T1 | 1 104,00 | 529,00 | 165,60 + domínio 13,80 + papelaria 4,60 + computador 345,00 (campo 20) | **575,00** | 26/05/2025 (25/05 é domingo) |
| T2 | 2 415,00 | 171,35 | 165,60 + gasóleo 11,50 × 50% = 5,75 + refeição 0 (art. 21.º) | **2 243,65** | 25/08/2025 |
| T3 | 1 656,00 | 165,60 | cabos sem fatura: 0 (art. 19.º, n.º 2) | **1 490,40** | 25/11/2025 |
| T4 | 2 277,00 | 280,60 | 165,60 + gráfica 69,00 + formação 46,00 | **1 996,40** | 25/02/2026 |

O duplicado MEO de abril não conta. Total a pagar em 2025: 7 452,00 − 1 146,55 = **6 305,45 €**.

## Segurança Social (arts. 162.º, 163.º, 168.º Código Contributivo; IAS 2025 = 522,50 €)

| Rendimentos do trimestre | Relevante (70%) | Base mensal | Contribuição (21,4%) | Meses |
|---|---:|---:|---:|---|
| T3 2024: 6 000,00 | 4 200,00 | 1 400,00 | 299,60 | out–dez 2024 |
| T4 2024: 7 800,00 | 5 460,00 | 1 820,00 | 389,48 | jan–mar 2025 |
| T1 2025: 4 800,00 | 3 360,00 | 1 120,00 | 239,68 | abr–jun 2025 |
| T2 2025: 10 500,00 | 7 350,00 | 2 450,00 | 524,30 | jul–set 2025 |
| T3 2025: 7 200,00 | 5 040,00 | 1 680,00 | 359,52 | out–dez 2025 |
| T4 2025: 9 900,00 | 6 930,00 | 2 310,00 | 494,34 | jan–mar 2026 |

Pago em 2025 (pagamento no mês seguinte): 299,60 + 3 × 389,48 + 3 × 239,68 + 3 × 524,30 + 2 × 359,52 = **4 479,02 €** (igual ao extrato).
Contribuições respeitantes a meses de 2025: **4 538,94 €**.

## IRS 2025 — regime simplificado (escalões de 2025, Lei n.º 55-A/2025)

1. Rendimento bruto: 32 400,00 € × 0,75 = **24 300,00 €** (art. 31.º, n.º 1, b)).
2. Justificação dos 15% (art. 31.º, n.º 13): exigido 15% × 32 400 = 4 860,00 €;
   justificado = max(4 462,15; contribuições 4 479,02) + despesas e-fatura 5 049,65 = 9 528,67 € → **sem acréscimo**.
   Despesas e-fatura = base + IVA não dedutível: software 600 + telecom 480 + coworking 1 800 + domínio 60 + papelaria 20
   + computador 1 500 + gasóleo 55,75 + refeição 33,90 + gráfica 300 + formação 200 = 5 049,65 €.
3. Coleta: 8 059 × 12,5% + 4 101 × 16% + 5 073 × 21,5% + 5 073 × 24,4% + 1 994 × 31,4%
   = 1 007,375 + 656,16 + 1 090,695 + 1 237,812 + 626,116 = **4 618,16 €**.
4. Deduções à coleta: despesas gerais familiares 35% × 1 000 = 350 → limite **250,00 €**.
5. Coleta líquida 4 368,16 € − retenções 7 176,00 € = **−2 807,84 € (reembolso)**.

## Calendário de 2025 (37 obrigações, prazos ajustados a dias úteis)

- IVA: declarações 20/02, 20/05, 20/08, 20/11; pagamentos 25/02, 26/05, 25/08, 25/11.
- Segurança Social: declarações trimestrais 31/01, 30/04, 31/07, 31/10; contribuições 20/01, 20/02, 20/03, 21/04, 20/05, 20/06, 21/07, 20/08, 22/09, 20/10, 20/11, 22/12.
- IRS 2024 (Modelo 3 com Anexos B e SS): de 01/04 a 30/06.
- Comunicação de faturas: 12 (automática pelo software certificado).

> Valores sujeitos aos parâmetros assinalados como "a confirmar" em `packages/tax-engine/params/2025.json`.
