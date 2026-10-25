import type { DoorWindowType } from '../types';

export interface DoorWindowCatalogEntry {
  type: DoorWindowType;
  label: string;
  width: number; // cm default
  height: number; // cm default
  category: 'Portes intérieures' | 'Portes extérieures' | 'Fenêtres' | 'Baies vitrées';
  description: string;
  materials: string[];
}

export const doorWindowCatalog: DoorWindowCatalogEntry[] = [
  {
    type: 'door-interior', label: 'Porte intérieure',
    width: 83, height: 204, category: 'Portes intérieures',
    description: 'Porte battante standard intérieure',
    materials: ['Bois', 'Bois massif', 'MDF', 'Verre'],
  },
  {
    type: 'door-sliding', label: 'Porte coulissante',
    width: 83, height: 204, category: 'Portes intérieures',
    description: 'Porte coulissante à galandage ou en applique',
    materials: ['Bois', 'Verre', 'Alu'],
  },
  {
    type: 'door-exterior', label: 'Porte d\'entrée',
    width: 90, height: 215, category: 'Portes extérieures',
    description: 'Porte d\'entrée sécurisée',
    materials: ['Bois', 'Alu', 'PVC', 'Acier', 'Composite'],
  },
  {
    type: 'door-french', label: 'Porte-fenêtre',
    width: 140, height: 215, category: 'Portes extérieures',
    description: 'Porte-fenêtre à 2 vantaux donnant sur terrasse/jardin',
    materials: ['Bois', 'Alu', 'PVC', 'Mixte bois-alu'],
  },
  {
    type: 'door-garage', label: 'Porte de garage',
    width: 240, height: 200, category: 'Portes extérieures',
    description: 'Porte de garage sectionnelle ou basculante',
    materials: ['Acier', 'Alu', 'Bois', 'PVC'],
  },
  {
    type: 'door-service', label: 'Porte de service',
    width: 80, height: 200, category: 'Portes extérieures',
    description: 'Porte secondaire (accès garage, buanderie)',
    materials: ['PVC', 'Alu', 'Acier'],
  },
  {
    type: 'window-standard', label: 'Fenêtre standard',
    width: 120, height: 135, category: 'Fenêtres',
    description: 'Fenêtre à 1 ou 2 vantaux oscillo-battante',
    materials: ['PVC', 'Alu', 'Bois', 'Mixte'],
  },
  {
    type: 'window-fixed', label: 'Fenêtre fixe',
    width: 60, height: 135, category: 'Fenêtres',
    description: 'Fenêtre fixe non ouvrante (châssis fixe)',
    materials: ['PVC', 'Alu', 'Bois'],
  },
  {
    type: 'window-sliding', label: 'Fenêtre coulissante',
    width: 180, height: 135, category: 'Fenêtres',
    description: 'Fenêtre coulissante 2 ou 3 rails',
    materials: ['Alu', 'PVC'],
  },
  {
    type: 'window-skylight', label: 'Velux / Fenêtre de toit',
    width: 78, height: 118, category: 'Fenêtres',
    description: 'Fenêtre de toit (Velux) pour combles',
    materials: ['Bois', 'PVC', 'Alu'],
  },
  {
    type: 'window-french', label: 'Porte-fenêtre vitrée',
    width: 120, height: 215, category: 'Baies vitrées',
    description: 'Porte-fenêtre vitrée pleine hauteur',
    materials: ['PVC', 'Alu', 'Bois'],
  },
  {
    type: 'window-bay', label: 'Baie vitrée coulissante',
    width: 240, height: 215, category: 'Baies vitrées',
    description: 'Grande baie vitrée coulissante 2-3 vantaux',
    materials: ['Alu', 'PVC', 'Mixte bois-alu'],
  },
];

export const defaultColors = ['#FFFFFF', '#F5F5DC', '#8B4513', '#A0522D', '#2F4F4F', '#708090', '#000000', '#CD853F'];
