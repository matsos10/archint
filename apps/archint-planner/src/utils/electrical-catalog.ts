import type { ElectricalType } from '../types';

export interface ElectricalCatalogEntry {
  type: ElectricalType;
  label: string;
  symbol: string;
  category: string;
}

export const electricalCatalog: ElectricalCatalogEntry[] = [
  { type: 'outlet', label: 'Prise', symbol: '⏚', category: 'Prises' },
  { type: 'switch', label: 'Interrupteur', symbol: '⏻', category: 'Commandes' },
  { type: 'light-ceiling', label: 'Plafonnier', symbol: '☀', category: 'Éclairage' },
  { type: 'light-wall', label: 'Applique', symbol: '◐', category: 'Éclairage' },
  { type: 'panel', label: 'Tableau élec.', symbol: '⚡', category: 'Distribution' },
  { type: 'thermostat', label: 'Thermostat', symbol: '🌡', category: 'Commandes' },
  { type: 'smoke-detector', label: 'Détecteur fumée', symbol: '🔔', category: 'Sécurité' },
];

export const wireGauges = ['1.5 mm²', '2.5 mm²', '6 mm²', '10 mm²', '16 mm²'];
