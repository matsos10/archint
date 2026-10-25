import p2025 from '../params/2025.json';
import p2026 from '../params/2026.json';
import { createParamsResolver, parseTaxParams } from '../src';

export const params2025 = parseTaxParams(p2025);
export const params2026 = parseTaxParams(p2026);
export const resolve = createParamsResolver([params2025, params2026]);
/** Euros → cêntimos (para escrever os casos de teste em euros, como se calculam à mão). */
export const c = (eur: number) => Math.round(eur * 100);
