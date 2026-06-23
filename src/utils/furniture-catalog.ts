import type { FurnitureType } from '../types';

interface CatalogEntry {
  type: FurnitureType;
  label: string;
  width: number;
  height: number;
  category: string;
}

export const furnitureCatalog: CatalogEntry[] = [
  { type: 'sofa', label: 'Canapé', width: 80, height: 40, category: 'Salon' },
  { type: 'table', label: 'Table', width: 60, height: 40, category: 'Salon' },
  { type: 'chair', label: 'Chaise', width: 20, height: 20, category: 'Salon' },
  { type: 'desk', label: 'Bureau', width: 60, height: 30, category: 'Salon' },
  { type: 'bed-single', label: 'Lit simple', width: 40, height: 80, category: 'Chambre' },
  { type: 'bed-double', label: 'Lit double', width: 60, height: 80, category: 'Chambre' },
  { type: 'wardrobe', label: 'Armoire', width: 60, height: 25, category: 'Chambre' },
  { type: 'bathtub', label: 'Baignoire', width: 70, height: 35, category: 'Salle de bain' },
  { type: 'shower', label: 'Douche', width: 40, height: 40, category: 'Salle de bain' },
  { type: 'toilet', label: 'WC', width: 20, height: 30, category: 'Salle de bain' },
  { type: 'sink', label: 'Lavabo', width: 25, height: 20, category: 'Salle de bain' },
  { type: 'kitchen-counter', label: 'Plan travail', width: 60, height: 25, category: 'Cuisine' },
  { type: 'stove', label: 'Cuisinière', width: 30, height: 25, category: 'Cuisine' },
  { type: 'fridge', label: 'Frigo', width: 30, height: 30, category: 'Cuisine' },
  { type: 'door', label: 'Porte', width: 40, height: 40, category: 'Structure' },
  { type: 'window', label: 'Fenêtre', width: 40, height: 8, category: 'Structure' },
];
