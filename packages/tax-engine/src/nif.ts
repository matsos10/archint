/**
 * Validação do NIF português (9 dígitos, dígito de controlo módulo 11).
 * Prefixos: 1, 2, 3 pessoas singulares; 45 não residentes singulares; 5 pessoas coletivas;
 * 6 administração pública; 70, 74, 75 heranças indivisas; 71 não residentes coletivos;
 * 72 fundos de investimento; 77 atribuição oficiosa; 79 regime excecional; 8 ENI (antigo);
 * 90, 91 condomínios/sociedades irregulares; 98 não residentes sem estabelecimento; 99 sociedades civis.
 */
export function isValidNif(nif: string): boolean {
  const n = nif.replace(/\s/g, '');
  if (!/^\d{9}$/.test(n)) return false;
  const prefix1 = n[0]!;
  const prefix2 = n.slice(0, 2);
  const validPrefix =
    ['1', '2', '3', '5', '6', '8'].includes(prefix1) ||
    ['45', '70', '71', '72', '74', '75', '77', '79', '90', '91', '98', '99'].includes(prefix2);
  if (!validPrefix) return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += Number(n[i]) * (9 - i);
  const mod = sum % 11;
  const check = mod < 2 ? 0 : 11 - mod;
  return check === Number(n[8]);
}

export function isIndividualNif(nif: string): boolean {
  return isValidNif(nif) && (['1', '2', '3'].includes(nif[0]!) || nif.startsWith('45'));
}

export function isCompanyNif(nif: string): boolean {
  return isValidNif(nif) && ['5', '6', '9'].includes(nif[0]!);
}
