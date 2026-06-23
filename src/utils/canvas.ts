import type { Point, Wall, FurnitureItem, ElectricalPoint, ElectricalWire, PlumbingPoint, PlumbingPipe } from '../types';
import { electricalCatalog } from './electrical-catalog';
import { plumbingCatalog } from './plumbing-catalog';

const GRID_SIZE = 20;
const PIXELS_PER_METER = 40;

export function snapToGrid(point: Point): Point {
  return {
    x: Math.round(point.x / GRID_SIZE) * GRID_SIZE,
    y: Math.round(point.y / GRID_SIZE) * GRID_SIZE,
  };
}

export function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number, offset: Point, scale: number) {
  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 0.5;
  const step = GRID_SIZE * scale;
  const ox = offset.x % step;
  const oy = offset.y % step;

  for (let x = ox; x < width; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = oy; y < height; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

export function drawWall(ctx: CanvasRenderingContext2D, wall: Wall, offset: Point, scale: number, highlight: boolean) {
  const sx = wall.start.x * scale + offset.x;
  const sy = wall.start.y * scale + offset.y;
  const ex = wall.end.x * scale + offset.x;
  const ey = wall.end.y * scale + offset.y;

  ctx.strokeStyle = highlight ? '#2196F3' : '#333';
  ctx.lineWidth = wall.thickness * scale;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.stroke();

  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const len = Math.sqrt(dx * dx + dy * dy) / PIXELS_PER_METER;
  if (len > 0.1) {
    const mx = (sx + ex) / 2;
    const my = (sy + ey) / 2;
    ctx.fillStyle = '#666';
    ctx.font = `${11 * scale}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(`${len.toFixed(2)}m`, mx, my - 10 * scale);
  }
}

export function drawFurniture(ctx: CanvasRenderingContext2D, item: FurnitureItem, offset: Point, scale: number, highlight: boolean) {
  const x = item.x * scale + offset.x;
  const y = item.y * scale + offset.y;
  const w = item.width * scale;
  const h = item.height * scale;

  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((item.rotation * Math.PI) / 180);

  const colors: Record<string, string> = {
    'sofa': '#8B4513',
    'bed-single': '#6495ED',
    'bed-double': '#4169E1',
    'table': '#DEB887',
    'chair': '#D2691E',
    'desk': '#CD853F',
    'wardrobe': '#A0522D',
    'bathtub': '#87CEEB',
    'shower': '#ADD8E6',
    'toilet': '#F5F5DC',
    'sink': '#B0C4DE',
    'kitchen-counter': '#808080',
    'stove': '#696969',
    'fridge': '#C0C0C0',
    'door': '#228B22',
    'window': '#00CED1',
  };

  ctx.fillStyle = highlight ? '#90CAF9' : (colors[item.type] || '#999');
  ctx.strokeStyle = highlight ? '#2196F3' : '#333';
  ctx.lineWidth = 1.5;

  if (item.type === 'door') {
    ctx.beginPath();
    ctx.moveTo(-w / 2, h / 2);
    ctx.lineTo(-w / 2, -h / 2);
    ctx.arc(-w / 2, h / 2, h, -Math.PI / 2, 0);
    ctx.stroke();
  } else if (item.type === 'window') {
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(0, -h / 2);
    ctx.lineTo(0, h / 2);
    ctx.stroke();
  } else {
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeRect(-w / 2, -h / 2, w, h);
  }

  ctx.fillStyle = '#333';
  ctx.font = `${9 * scale}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(item.label, 0, 3);

  ctx.restore();
}

export function drawElectricalPoint(ctx: CanvasRenderingContext2D, pt: ElectricalPoint, offset: Point, scale: number, highlight: boolean) {
  const x = pt.x * scale + offset.x;
  const y = pt.y * scale + offset.y;
  const r = 12 * scale;

  ctx.save();

  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = highlight ? '#FFF176' : '#FFE082';
  ctx.fill();
  ctx.strokeStyle = highlight ? '#F57F17' : '#FF8F00';
  ctx.lineWidth = 2;
  ctx.stroke();

  const entry = electricalCatalog.find((e) => e.type === pt.type);
  ctx.fillStyle = '#333';
  ctx.font = `${14 * scale}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(entry?.symbol || '?', x, y);

  ctx.font = `${8 * scale}px sans-serif`;
  ctx.fillStyle = '#666';
  ctx.textBaseline = 'top';
  ctx.fillText(pt.label, x, y + r + 2);

  ctx.restore();
}

export function drawElectricalWire(ctx: CanvasRenderingContext2D, wire: ElectricalWire, offset: Point, scale: number, highlight: boolean) {
  const sx = wire.start.x * scale + offset.x;
  const sy = wire.start.y * scale + offset.y;
  const ex = wire.end.x * scale + offset.x;
  const ey = wire.end.y * scale + offset.y;

  ctx.save();
  ctx.strokeStyle = highlight ? '#F57F17' : '#FFA000';
  ctx.lineWidth = 2 * scale;
  ctx.setLineDash([6 * scale, 4 * scale]);
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.setLineDash([]);

  const dx = wire.end.x - wire.start.x;
  const dy = wire.end.y - wire.start.y;
  const len = Math.sqrt(dx * dx + dy * dy) / PIXELS_PER_METER;
  if (len > 0.1) {
    ctx.fillStyle = '#F57F17';
    ctx.font = `${9 * scale}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(`${len.toFixed(1)}m ${wire.gauge}`, (sx + ex) / 2, (sy + ey) / 2 - 8 * scale);
  }
  ctx.restore();
}

const PIPE_COLORS = { supply: '#2196F3', hot: '#F44336', drain: '#795548' };

export function drawPlumbingPoint(ctx: CanvasRenderingContext2D, pt: PlumbingPoint, offset: Point, scale: number, highlight: boolean) {
  const x = pt.x * scale + offset.x;
  const y = pt.y * scale + offset.y;
  const r = 12 * scale;
  const color = PIPE_COLORS[pt.network];

  ctx.save();

  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = highlight ? '#E3F2FD' : '#fff';
  ctx.fill();
  ctx.strokeStyle = highlight ? '#0D47A1' : color;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  const entry = plumbingCatalog.find((e) => e.type === pt.type);
  ctx.fillStyle = '#333';
  ctx.font = `${13 * scale}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(entry?.symbol || '?', x, y);

  ctx.font = `${8 * scale}px sans-serif`;
  ctx.fillStyle = '#666';
  ctx.textBaseline = 'top';
  ctx.fillText(pt.label, x, y + r + 2);

  ctx.restore();
}

export function drawPlumbingPipe(ctx: CanvasRenderingContext2D, pipe: PlumbingPipe, offset: Point, scale: number, highlight: boolean) {
  const sx = pipe.start.x * scale + offset.x;
  const sy = pipe.start.y * scale + offset.y;
  const ex = pipe.end.x * scale + offset.x;
  const ey = pipe.end.y * scale + offset.y;
  const color = PIPE_COLORS[pipe.network];

  ctx.save();
  ctx.strokeStyle = highlight ? '#0D47A1' : color;
  ctx.lineWidth = 3 * scale;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.stroke();

  const dx = pipe.end.x - pipe.start.x;
  const dy = pipe.end.y - pipe.start.y;
  const len = Math.sqrt(dx * dx + dy * dy) / PIXELS_PER_METER;
  if (len > 0.1) {
    ctx.fillStyle = color;
    ctx.font = `${9 * scale}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(`${len.toFixed(1)}m Ø${pipe.diameter}`, (sx + ex) / 2, (sy + ey) / 2 - 8 * scale);
  }
  ctx.restore();
}

export function hitTestWall(wall: Wall, point: Point, threshold: number): boolean {
  const { start, end } = wall;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return false;
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / len2));
  const px = start.x + t * dx;
  const py = start.y + t * dy;
  const dist = Math.sqrt((point.x - px) ** 2 + (point.y - py) ** 2);
  return dist < threshold;
}

export function hitTestFurniture(item: FurnitureItem, point: Point): boolean {
  return point.x >= item.x && point.x <= item.x + item.width &&
         point.y >= item.y && point.y <= item.y + item.height;
}

export function hitTestPoint(pt: { x: number; y: number }, click: Point, radius: number): boolean {
  return Math.sqrt((click.x - pt.x) ** 2 + (click.y - pt.y) ** 2) < radius;
}

export function hitTestLine(line: { start: Point; end: Point }, point: Point, threshold: number): boolean {
  return hitTestWall(line as Wall, point, threshold);
}
