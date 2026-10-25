const eur = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
export const formatEurPlain = (cents: number) => eur.format(cents / 100);
