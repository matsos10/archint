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

export type DoorWindowType =
  | 'door-interior'
  | 'door-exterior'
  | 'door-sliding'
  | 'door-french'
  | 'door-garage'
  | 'door-service'
  | 'window-standard'
  | 'window-french'
  | 'window-bay'
  | 'window-skylight'
  | 'window-fixed'
  | 'window-sliding';

export type OpeningDirection = 'left' | 'right';

export interface DoorWindow {
  id: string;
  type: DoorWindowType;
  wallId: string;
  position: number; // 0-1 along wall
  width: number; // cm
  height: number; // cm
  label: string;
  openingDirection: OpeningDirection;
  openingAngle: number; // degrees
  material: string;
  color: string;
}

export type ElectricalType =
  | 'outlet'
  | 'switch'
  | 'light-ceiling'
  | 'light-wall'
  | 'panel'
  | 'thermostat'
  | 'smoke-detector';

export type PlumbingType =
  | 'water-supply'
  | 'hot-water'
  | 'drain'
  | 'water-heater'
  | 'supply-valve'
  | 'drain-valve'
  | 'water-meter';

export interface ElectricalPoint {
  id: string;
  type: ElectricalType;
  x: number;
  y: number;
  label: string;
  circuit: string;
}

export interface ElectricalWire {
  id: string;
  start: Point;
  end: Point;
  circuit: string;
  gauge: string;
}

export interface PlumbingPoint {
  id: string;
  type: PlumbingType;
  x: number;
  y: number;
  label: string;
  network: 'supply' | 'hot' | 'drain';
}

export interface PlumbingPipe {
  id: string;
  start: Point;
  end: Point;
  network: 'supply' | 'hot' | 'drain';
  diameter: number;
}

export type SurfaceCategory = 'floor' | 'wall-covering' | 'ceiling';

export interface Surface {
  id: string;
  category: SurfaceCategory;
  material: string; // material key from surface-catalog
  // Rect mode (floor/ceiling): position + size
  x: number;
  y: number;
  width: number;
  height: number;
  // Line mode (wall-covering): drawn like a wall segment
  start?: Point;
  end?: Point;
  wallHeight?: number; // meters, default 2.5
}

export type Tool = 'select' | 'wall' | 'furniture' | 'eraser' | 'measure' | 'electrical-point' | 'electrical-wire' | 'plumbing-point' | 'plumbing-pipe' | 'door-window' | 'surface';

export interface FloorPlan {
  id: string;
  name: string;
  walls: Wall[];
  furniture: FurnitureItem[];
  doorsWindows: DoorWindow[];
  surfaces: Surface[];
  electricalPoints: ElectricalPoint[];
  electricalWires: ElectricalWire[];
  plumbingPoints: PlumbingPoint[];
  plumbingPipes: PlumbingPipe[];
  gridSize: number;
}

export interface MaterialItem {
  name: string;
  quantity: number;
  unit: string;
  category: string; // 'electrical' | 'plumbing' | 'Sols' | 'Murs' | 'Plafond'
}
