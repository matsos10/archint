import type { PlumbingType } from '../types';

export interface PlumbingCatalogEntry {
  type: PlumbingType;
  label: string;
  symbol: string;
  network: 'supply' | 'hot' | 'drain';
  category: string;
}

export const plumbingCatalog: PlumbingCatalogEntry[] = [
  { type: 'water-supply', label: 'Arrivée eau froide', symbol: '💧', network: 'supply', category: 'Arrivée eau' },
  { type: 'hot-water', label: 'Arrivée eau chaude', symbol: '♨', network: 'hot', category: 'Arrivée eau' },
  { type: 'supply-valve', label: 'Vanne arrivée', symbol: '⊗', network: 'supply', category: 'Arrivée eau' },
  { type: 'water-meter', label: 'Compteur eau', symbol: '⊙', network: 'supply', category: 'Arrivée eau' },
  { type: 'water-heater', label: 'Chauffe-eau', symbol: '🔥', network: 'hot', category: 'Arrivée eau' },
  { type: 'drain', label: 'Évacuation', symbol: '▽', network: 'drain', category: 'Évacuation' },
  { type: 'drain-valve', label: 'Siphon/Clapet', symbol: '⊘', network: 'drain', category: 'Évacuation' },
];

export const pipeDiameters = [12, 16, 20, 25, 32, 40, 50, 75, 100];
