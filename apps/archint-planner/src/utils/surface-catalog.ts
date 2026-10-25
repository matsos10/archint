import type { SurfaceCategory } from '../types';

export interface SurfaceComponent {
  name: string;
  perM2: number; // quantité consommée par m² (avant division par packSize)
  unit: string;
  packSize?: number; // diviser le total par packSize puis arrondir au supérieur
}

export interface SurfaceMaterial {
  key: string;
  label: string;
  category: SurfaceCategory;
  color: string;
  components: SurfaceComponent[];
}

export const surfaceCategories: { id: SurfaceCategory; label: string; icon: string }[] = [
  { id: 'floor', label: 'Sols', icon: '▦' },
  { id: 'wall-covering', label: 'Murs', icon: '▥' },
  { id: 'ceiling', label: 'Plafond', icon: '☁' },
];

export const categoryLabel: Record<SurfaceCategory, string> = {
  floor: 'Sols',
  'wall-covering': 'Murs',
  ceiling: 'Plafond',
};

export const surfaceCatalog: SurfaceMaterial[] = [
  // --- Sols ---
  {
    key: 'floor-tile-60', label: 'Carrelage 60×60', category: 'floor', color: '#D7CCC8',
    components: [
      { name: 'Carrelage 60×60 cm', perM2: 1 / 0.36, unit: 'pcs' },
      { name: 'Colle carrelage (sac 25kg)', perM2: 5, unit: 'sacs', packSize: 25 },
      { name: 'Joint carrelage (sac 5kg)', perM2: 0.5, unit: 'sacs', packSize: 5 },
      { name: 'Croisillons', perM2: 8, unit: 'pcs' },
    ],
  },
  {
    key: 'floor-tile-30', label: 'Carrelage 30×30', category: 'floor', color: '#CFC0B0',
    components: [
      { name: 'Carrelage 30×30 cm', perM2: 1 / 0.09, unit: 'pcs' },
      { name: 'Colle carrelage (sac 25kg)', perM2: 5, unit: 'sacs', packSize: 25 },
      { name: 'Joint carrelage (sac 5kg)', perM2: 0.6, unit: 'sacs', packSize: 5 },
      { name: 'Croisillons', perM2: 14, unit: 'pcs' },
    ],
  },
  {
    key: 'floor-laminate', label: 'Stratifié', category: 'floor', color: '#C9A66B',
    components: [
      { name: 'Stratifié lame (1380×193mm)', perM2: 1 / (1.38 * 0.193), unit: 'pcs' },
      { name: 'Sous-couche mousse 3mm (rouleau 15m²)', perM2: 1, unit: 'rouleaux', packSize: 15 },
      { name: 'Plinthe (barre 2.4m)', perM2: 0.4, unit: 'pcs', packSize: 2.4 },
    ],
  },
  {
    key: 'floor-parquet', label: 'Parquet massif', category: 'floor', color: '#B5853F',
    components: [
      { name: 'Parquet massif (m²)', perM2: 1, unit: 'm²' },
      { name: 'Colle parquet (sac 25kg)', perM2: 1.2, unit: 'sacs', packSize: 25 },
      { name: 'Plinthe (barre 2.4m)', perM2: 0.4, unit: 'pcs', packSize: 2.4 },
    ],
  },
  {
    key: 'floor-vinyl', label: 'Sol PVC / Lino', category: 'floor', color: '#9E9E9E',
    components: [
      { name: 'Sol PVC (m²)', perM2: 1, unit: 'm²' },
      { name: 'Colle sol souple (kg)', perM2: 0.3, unit: 'kg' },
    ],
  },

  // --- Murs (revêtement) ---
  {
    key: 'wall-tile', label: 'Faïence 30×60', category: 'wall-covering', color: '#B3E5FC',
    components: [
      { name: 'Faïence 30×60 cm', perM2: 1 / 0.18, unit: 'pcs' },
      { name: 'Colle carrelage mural (sac 25kg)', perM2: 4, unit: 'sacs', packSize: 25 },
      { name: 'Joint carrelage (sac 5kg)', perM2: 0.4, unit: 'sacs', packSize: 5 },
      { name: 'Croisillons', perM2: 6, unit: 'pcs' },
    ],
  },
  {
    key: 'wall-paint', label: 'Peinture', category: 'wall-covering', color: '#FFF9C4',
    components: [
      { name: 'Peinture murale (pot 10L, 2 couches)', perM2: 0.2, unit: 'pots', packSize: 10 },
      { name: 'Sous-couche mur (pot 10L)', perM2: 0.1, unit: 'pots', packSize: 10 },
    ],
  },
  {
    key: 'wall-wallpaper', label: 'Papier peint', category: 'wall-covering', color: '#E1BEE7',
    components: [
      { name: 'Rouleau papier peint (5m²)', perM2: 1, unit: 'rouleaux', packSize: 5 },
      { name: 'Colle papier peint (paquet 200g)', perM2: 0.03, unit: 'paquets', packSize: 0.2 },
    ],
  },
  {
    key: 'wall-ba13', label: 'Doublage BA13 + LSF', category: 'wall-covering', color: '#ECEFF1',
    components: [
      { name: 'Plaque de plâtre BA13 (1200×2500)', perM2: 1 / 3, unit: 'pcs' },
      { name: 'Rail R48 (3m)', perM2: 0.8, unit: 'pcs', packSize: 3 },
      { name: 'Montant M48 (2.5m)', perM2: 0.67, unit: 'pcs' },
      { name: 'Panneau isolant laine minérale 45mm (1200×600)', perM2: 1 / 0.72, unit: 'pcs' },
      { name: 'Vis plaque TTPC 25mm', perM2: 17, unit: 'pcs' },
      { name: 'Bande à joint (rouleau 23m)', perM2: 1.4, unit: 'rouleaux', packSize: 23 },
      { name: 'Enduit à joint (sac 25kg)', perM2: 0.4, unit: 'sacs', packSize: 25 },
    ],
  },
  {
    key: 'wall-ba13-glued', label: 'Doublage BA13 collé (sans LSF)', category: 'wall-covering', color: '#E0E0E0',
    components: [
      { name: 'Plaque de plâtre BA13 (1200×2500)', perM2: 1 / 3, unit: 'pcs' },
      { name: 'Mortier adhésif MAP (sac 25kg)', perM2: 4, unit: 'sacs', packSize: 25 },
      { name: 'Bande à joint (rouleau 23m)', perM2: 1.4, unit: 'rouleaux', packSize: 23 },
      { name: 'Enduit à joint (sac 25kg)', perM2: 0.4, unit: 'sacs', packSize: 25 },
    ],
  },
  {
    key: 'wall-doublage-isolant', label: 'Doublage collé isolé (BA13 + PSE)', category: 'wall-covering', color: '#D7CCC0',
    components: [
      { name: 'Complexe doublage BA13+PSE (1200×2600)', perM2: 1 / 3.12, unit: 'pcs' },
      { name: 'Mortier adhésif MAP (sac 25kg)', perM2: 4, unit: 'sacs', packSize: 25 },
      { name: 'Bande à joint (rouleau 23m)', perM2: 1.4, unit: 'rouleaux', packSize: 23 },
      { name: 'Enduit à joint (sac 25kg)', perM2: 0.4, unit: 'sacs', packSize: 25 },
    ],
  },

  // --- Plafond ---
  {
    key: 'ceiling-ba13', label: 'Faux plafond BA13 + LSF', category: 'ceiling', color: '#F5F5F5',
    components: [
      { name: 'Plaque de plâtre BA13 (1200×2500)', perM2: 1 / 3, unit: 'pcs' },
      { name: 'Fourrure F530 (3m)', perM2: 2.83, unit: 'pcs', packSize: 3 },
      { name: 'Suspente (tige + clip)', perM2: 0.7, unit: 'pcs' },
      { name: 'Cornière périphérique (3m)', perM2: 0.5, unit: 'pcs', packSize: 3 },
      { name: 'Panneau isolant laine minérale (1200×600)', perM2: 1 / 0.72, unit: 'pcs' },
      { name: 'Vis plaque TTPC 25mm', perM2: 17, unit: 'pcs' },
    ],
  },
  {
    key: 'ceiling-ba13-screwed', label: 'Plaque BA13 vissée (sans ossature)', category: 'ceiling', color: '#EEEEEE',
    components: [
      { name: 'Plaque de plâtre BA13 (1200×2500)', perM2: 1 / 3, unit: 'pcs' },
      { name: 'Vis plaque TTPC 25mm', perM2: 17, unit: 'pcs' },
      { name: 'Bande à joint (rouleau 23m)', perM2: 1.4, unit: 'rouleaux', packSize: 23 },
      { name: 'Enduit à joint (sac 25kg)', perM2: 0.4, unit: 'sacs', packSize: 25 },
    ],
  },
  {
    key: 'ceiling-paint', label: 'Peinture plafond', category: 'ceiling', color: '#FFFDE7',
    components: [
      { name: 'Peinture plafond (pot 10L, 2 couches)', perM2: 0.2, unit: 'pots', packSize: 10 },
      { name: 'Sous-couche plafond (pot 10L)', perM2: 0.1, unit: 'pots', packSize: 10 },
    ],
  },
  {
    key: 'ceiling-pvc', label: 'Lambris PVC', category: 'ceiling', color: '#E0F2F1',
    components: [
      { name: 'Lambris PVC (m²)', perM2: 1, unit: 'm²' },
      { name: 'Tasseau bois (barre 2m)', perM2: 1.5, unit: 'pcs', packSize: 2 },
    ],
  },
];

export function getSurfaceMaterial(key: string): SurfaceMaterial | undefined {
  return surfaceCatalog.find((m) => m.key === key);
}
