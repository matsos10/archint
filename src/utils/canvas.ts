import type { Point, Wall, FurnitureItem, ElectricalPoint, ElectricalWire, PlumbingPoint, PlumbingPipe, DoorWindow } from '../types';
import { electricalCatalog } from './electrical-catalog';
import { plumbingCatalog } from './plumbing-catalog';
import { furnitureIcons } from './furniture-icons';

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

  if (highlight) {
    for (const pt of [{ x: sx, y: sy }, { x: ex, y: ey }]) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 6 * scale, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.strokeStyle = '#2196F3';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}

const iconCache = new Map<string, HTMLImageElement>();

function getIcon(type: string): HTMLImageElement | null {
  const svgStr = furnitureIcons[type];
  if (!svgStr) return null;
  if (iconCache.has(type)) return iconCache.get(type)!;
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
  iconCache.set(type, img);
  return img;
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
    'sofa': '#8B4513', 'bed-single': '#6495ED', 'bed-double': '#4169E1',
    'table': '#DEB887', 'chair': '#D2691E', 'desk': '#CD853F',
    'wardrobe': '#A0522D', 'bathtub': '#87CEEB', 'shower': '#ADD8E6',
    'toilet': '#F5F5DC', 'sink': '#B0C4DE', 'kitchen-counter': '#808080',
    'stove': '#696969', 'fridge': '#C0C0C0', 'door': '#228B22', 'window': '#00CED1',
  };

  ctx.fillStyle = highlight ? 'rgba(144,202,249,0.5)' : (colors[item.type] ? colors[item.type] + '40' : '#99999940');
  ctx.strokeStyle = highlight ? '#2196F3' : '#555';
  ctx.lineWidth = highlight ? 2 : 1;

  if (item.type === 'door') {
    ctx.beginPath();
    ctx.moveTo(-w / 2, h / 2);
    ctx.lineTo(-w / 2, -h / 2);
    ctx.arc(-w / 2, h / 2, h, -Math.PI / 2, 0);
    ctx.stroke();
  } else if (item.type === 'window') {
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = '#00CED1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -h / 2);
    ctx.lineTo(0, h / 2);
    ctx.stroke();
  } else {
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeRect(-w / 2, -h / 2, w, h);
  }

  const icon = getIcon(item.type);
  if (icon && icon.complete && icon.naturalWidth > 0) {
    const pad = 4 * scale;
    const iw = w - pad * 2;
    const ih = h - pad * 2;
    const sz = Math.min(iw, ih);
    ctx.drawImage(icon, -sz / 2, -sz / 2, sz, sz);
  }

  ctx.fillStyle = '#333';
  ctx.font = `bold ${8 * scale}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(item.label, 0, h / 2 - 1);

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

export function drawDoorWindow(ctx: CanvasRenderingContext2D, dw: DoorWindow, wall: Wall, offset: Point, scale: number, highlight: boolean) {
  const wx = wall.end.x - wall.start.x;
  const wy = wall.end.y - wall.start.y;
  const wallLen = Math.sqrt(wx * wx + wy * wy);
  const angle = Math.atan2(wy, wx);

  const px = wall.start.x + wx * dw.position;
  const py = wall.start.y + wy * dw.position;
  const screenX = px * scale + offset.x;
  const screenY = py * scale + offset.y;

  const dwWidthPx = (dw.width / 100) * PIXELS_PER_METER * scale;
  const isDoor = dw.type.startsWith('door');

  ctx.save();
  ctx.translate(screenX, screenY);
  ctx.rotate(angle);

  // Gap in wall
  ctx.clearRect(-dwWidthPx / 2, -wall.thickness * scale / 2 - 1, dwWidthPx, wall.thickness * scale + 2);
  ctx.fillStyle = '#fafafa';
  ctx.fillRect(-dwWidthPx / 2, -wall.thickness * scale / 2 - 1, dwWidthPx, wall.thickness * scale + 2);

  if (isDoor) {
    const dir = dw.openingDirection === 'left' ? -1 : 1;
    const arcRadius = dwWidthPx;
    const startAngle = dw.openingDirection === 'left' ? -Math.PI / 2 : -Math.PI / 2;
    const openRad = (dw.openingAngle * Math.PI) / 180;

    // Door leaf
    ctx.strokeStyle = highlight ? '#1565C0' : (dw.color === '#FFFFFF' ? '#8B4513' : dw.color);
    ctx.lineWidth = 2.5 * scale;
    ctx.beginPath();
    ctx.moveTo(dir * -dwWidthPx / 2, 0);
    ctx.lineTo(dir * -dwWidthPx / 2, -arcRadius * Math.sin(openRad / 2));
    ctx.stroke();

    // Arc
    ctx.strokeStyle = highlight ? '#64B5F6' : '#aaa';
    ctx.lineWidth = 1;
    ctx.setLineDash([3 * scale, 3 * scale]);
    ctx.beginPath();
    if (dw.openingDirection === 'left') {
      ctx.arc(-dwWidthPx / 2, 0, arcRadius, startAngle, startAngle + openRad);
    } else {
      ctx.arc(dwWidthPx / 2, 0, arcRadius, -Math.PI / 2 - openRad, -Math.PI / 2);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    if (dw.type === 'door-sliding') {
      ctx.strokeStyle = highlight ? '#1565C0' : '#666';
      ctx.lineWidth = 3 * scale;
      ctx.setLineDash([4 * scale, 2 * scale]);
      ctx.beginPath();
      ctx.moveTo(-dwWidthPx / 2, -2 * scale);
      ctx.lineTo(dwWidthPx / 2, -2 * scale);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(-dwWidthPx / 4, -2 * scale);
      ctx.lineTo(dwWidthPx / 4, -2 * scale);
      ctx.lineWidth = 4 * scale;
      ctx.strokeStyle = dw.color === '#FFFFFF' ? '#8B4513' : dw.color;
      ctx.stroke();
    }

    // Frame marks
    ctx.fillStyle = highlight ? '#1565C0' : '#333';
    ctx.fillRect(-dwWidthPx / 2 - 2, -wall.thickness * scale / 2, 4, wall.thickness * scale);
    ctx.fillRect(dwWidthPx / 2 - 2, -wall.thickness * scale / 2, 4, wall.thickness * scale);
  } else {
    // Window
    ctx.fillStyle = dw.color === '#FFFFFF' ? '#E0F7FA80' : dw.color + '60';
    ctx.fillRect(-dwWidthPx / 2, -wall.thickness * scale / 2, dwWidthPx, wall.thickness * scale);

    ctx.strokeStyle = highlight ? '#00838F' : '#00ACC1';
    ctx.lineWidth = 2;
    ctx.strokeRect(-dwWidthPx / 2, -wall.thickness * scale / 2, dwWidthPx, wall.thickness * scale);

    // Center cross
    if (dw.type !== 'window-fixed') {
      ctx.beginPath();
      ctx.moveTo(0, -wall.thickness * scale / 2);
      ctx.lineTo(0, wall.thickness * scale / 2);
      ctx.stroke();
    }

    // Double lines for glass
    const inset = 2 * scale;
    ctx.strokeStyle = '#80DEEA';
    ctx.lineWidth = 1;
    ctx.strokeRect(-dwWidthPx / 2 + inset, -wall.thickness * scale / 2 + inset, dwWidthPx - inset * 2, wall.thickness * scale - inset * 2);

    if (dw.type === 'window-bay' || dw.type === 'window-sliding') {
      ctx.beginPath();
      ctx.moveTo(-dwWidthPx / 6, -wall.thickness * scale / 2);
      ctx.lineTo(-dwWidthPx / 6, wall.thickness * scale / 2);
      ctx.moveTo(dwWidthPx / 6, -wall.thickness * scale / 2);
      ctx.lineTo(dwWidthPx / 6, wall.thickness * scale / 2);
      ctx.strokeStyle = '#00ACC1';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // Label
  ctx.fillStyle = '#555';
  ctx.font = `${8 * scale}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(`${dw.label} ${dw.width}cm`, 0, wall.thickness * scale / 2 + 4 * scale);

  ctx.restore();
}

export function getDoorWindowPosition(wall: Wall, position: number): Point {
  return {
    x: wall.start.x + (wall.end.x - wall.start.x) * position,
    y: wall.start.y + (wall.end.y - wall.start.y) * position,
  };
}

export function hitTestDoorWindow(dw: DoorWindow, wall: Wall, click: Point, scale: number): boolean {
  const pos = getDoorWindowPosition(wall, dw.position);
  const dwWidthWorld = (dw.width / 100) * PIXELS_PER_METER;
  return Math.sqrt((click.x - pos.x) ** 2 + (click.y - pos.y) ** 2) < dwWidthWorld / 2 + 10 / scale;
}

export function findWallAtPoint(walls: Wall[], point: Point, threshold: number): { wall: Wall; t: number } | null {
  for (const wall of walls) {
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) continue;
    const t = Math.max(0, Math.min(1, ((point.x - wall.start.x) * dx + (point.y - wall.start.y) * dy) / len2));
    const px = wall.start.x + t * dx;
    const py = wall.start.y + t * dy;
    if (Math.sqrt((point.x - px) ** 2 + (point.y - py) ** 2) < threshold) {
      return { wall, t };
    }
  }
  return null;
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

export function hitTestWallEndpoint(wall: Wall, point: Point, radius: number): 'start' | 'end' | null {
  if (Math.sqrt((point.x - wall.start.x) ** 2 + (point.y - wall.start.y) ** 2) < radius) return 'start';
  if (Math.sqrt((point.x - wall.end.x) ** 2 + (point.y - wall.end.y) ** 2) < radius) return 'end';
  return null;
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
