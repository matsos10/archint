export interface Point {
  x: number;
  y: number;
}

export interface Wall {
  id: string;
  start: Point;
  end: Point;
  thickness: number;
}

export interface Room {
  id: string;
  name: string;
  walls: string[];
  color: string;
}

export interface FurnitureItem {
  id: string;
  type: FurnitureType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  label: string;
}

export type FurnitureType =
  | 'sofa'
  | 'bed-single'
  | 'bed-double'
  | 'table'
  | 'chair'
  | 'desk'
  | 'wardrobe'
  | 'bathtub'
  | 'shower'
  | 'toilet'
  | 'sink'
  | 'kitchen-counter'
  | 'stove'
  | 'fridge'
  | 'door'
  | 'window';

export type Tool = 'select' | 'wall' | 'furniture' | 'eraser' | 'measure';

export interface FloorPlan {
  id: string;
  name: string;
  walls: Wall[];
  furniture: FurnitureItem[];
  gridSize: number;
}
