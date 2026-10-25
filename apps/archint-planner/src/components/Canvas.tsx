import { useRef, useEffect, useState, useCallback } from 'react';
import type { Wall, FurnitureItem, Tool, Point, FurnitureType, ElectricalPoint, ElectricalWire, PlumbingPoint, PlumbingPipe, ElectricalType, PlumbingType, DoorWindow, DoorWindowType, Surface } from '../types';
import { drawGrid, drawWall, drawFurniture, drawElectricalPoint, drawElectricalWire, drawPlumbingPoint, drawPlumbingPipe, drawDoorWindow, drawSurface, snapToGrid, hitTestWall, hitTestWallEndpoint, hitTestFurniture, hitTestPoint, hitTestLine, hitTestDoorWindow, hitTestSurface, hitTestSurfaceHandle, findWallAtPoint, drawLineSurface, hitTestLineSurface, hitTestLineSurfaceEndpoint } from '../utils/canvas';
import { getSurfaceMaterial } from '../utils/surface-catalog';
import { doorWindowCatalog } from '../utils/door-window-catalog';
import { furnitureCatalog } from '../utils/furniture-catalog';
import { electricalCatalog } from '../utils/electrical-catalog';
import { plumbingCatalog } from '../utils/plumbing-catalog';
import { generateId } from '../utils/id';

type DragMode =
  | { type: 'furniture'; id: string; offsetX: number; offsetY: number }
  | { type: 'wall-endpoint'; id: string; endpoint: 'start' | 'end' }
  | { type: 'wall-move'; id: string; offsetStart: Point; offsetEnd: Point }
  | { type: 'electrical-point'; id: string }
  | { type: 'plumbing-point'; id: string }
  | { type: 'surface-move'; id: string; offsetX: number; offsetY: number }
  | { type: 'surface-resize'; id: string }
  | { type: 'wire-endpoint'; id: string; endpoint: 'start' | 'end' }
  | { type: 'wire-move'; id: string; offsetStart: Point; offsetEnd: Point }
  | { type: 'pipe-endpoint'; id: string; endpoint: 'start' | 'end' }
  | { type: 'pipe-move'; id: string; offsetStart: Point; offsetEnd: Point }
  | { type: 'line-surface-endpoint'; id: string; endpoint: 'start' | 'end' }
  | { type: 'line-surface-move'; id: string; offsetStart: Point; offsetEnd: Point }
  | null;

interface CanvasProps {
  walls: Wall[];
  furniture: FurnitureItem[];
  doorsWindows: DoorWindow[];
  surfaces: Surface[];
  electricalPoints: ElectricalPoint[];
  electricalWires: ElectricalWire[];
  plumbingPoints: PlumbingPoint[];
  plumbingPipes: PlumbingPipe[];
  activeTool: Tool;
  snapSize: number;
  selectedFurnitureType: FurnitureType | null;
  selectedElectricalType: ElectricalType | null;
  selectedPlumbingType: PlumbingType | null;
  selectedDoorWindowType: DoorWindowType | null;
  selectedSurfaceMaterial: string;
  selectedWireGauge: string;
  selectedPipeDiameter: number;
  selectedPipeNetwork: 'supply' | 'hot' | 'drain';
  selectedWallId: string | null;
  selectedFurnitureId: string | null;
  selectedDoorWindowId: string | null;
  selectedSurfaceId: string | null;
  selectedWireId: string | null;
  selectedPipeId: string | null;
  onAddWall: (wall: Wall) => void;
  onAddFurniture: (item: FurnitureItem) => void;
  onAddDoorWindow: (dw: DoorWindow) => void;
  onAddSurface: (s: Surface) => void;
  onAddElectricalPoint: (pt: ElectricalPoint) => void;
  onAddElectricalWire: (wire: ElectricalWire) => void;
  onAddPlumbingPoint: (pt: PlumbingPoint) => void;
  onAddPlumbingPipe: (pipe: PlumbingPipe) => void;
  onSelectWall: (id: string | null) => void;
  onSelectFurniture: (id: string | null) => void;
  onSelectDoorWindow: (id: string | null) => void;
  onSelectSurface: (id: string | null) => void;
  onSelectWire: (id: string | null) => void;
  onSelectPipe: (id: string | null) => void;
  onMoveFurniture: (id: string, x: number, y: number) => void;
  onMoveElectricalPoint: (id: string, x: number, y: number) => void;
  onMovePlumbingPoint: (id: string, x: number, y: number) => void;
  onUpdateSurface: (s: Surface) => void;
  onDeleteSurface: (id: string) => void;
  onUpdateWall: (wall: Wall) => void;
  onUpdateWire: (wire: ElectricalWire) => void;
  onUpdatePipe: (pipe: PlumbingPipe) => void;
  onDeleteWall: (id: string) => void;
  onDeleteFurniture: (id: string) => void;
  onDeleteDoorWindow: (id: string) => void;
  onDeleteElectricalPoint: (id: string) => void;
  onDeleteElectricalWire: (id: string) => void;
  onDeletePlumbingPoint: (id: string) => void;
  onDeletePlumbingPipe: (id: string) => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export function Canvas({
  walls, furniture, doorsWindows, surfaces, electricalPoints, electricalWires, plumbingPoints, plumbingPipes,
  activeTool, snapSize, selectedFurnitureType, selectedElectricalType, selectedPlumbingType, selectedDoorWindowType,
  selectedSurfaceMaterial, selectedWireGauge, selectedPipeDiameter, selectedPipeNetwork,
  selectedWallId, selectedFurnitureId, selectedDoorWindowId, selectedSurfaceId, selectedWireId, selectedPipeId,
  onAddWall, onAddFurniture, onAddDoorWindow, onAddSurface, onAddElectricalPoint, onAddElectricalWire,
  onAddPlumbingPoint, onAddPlumbingPipe,
  onSelectWall, onSelectFurniture, onSelectDoorWindow, onSelectSurface, onSelectWire, onSelectPipe,
  onMoveFurniture, onMoveElectricalPoint, onMovePlumbingPoint, onUpdateSurface, onDeleteSurface,
  onUpdateWall, onUpdateWire, onUpdatePipe,
  onDeleteWall, onDeleteFurniture, onDeleteDoorWindow,
  onDeleteElectricalPoint, onDeleteElectricalWire,
  onDeletePlumbingPoint, onDeletePlumbingPipe,
  canvasRef,
}: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [drawing, setDrawing] = useState(false);
  const [lineStart, setLineStart] = useState<Point | null>(null);
  const [mousePos, setMousePos] = useState<Point | null>(null);
  const [dragMode, setDragMode] = useState<DragMode>(null);
  const [panning, setPanning] = useState(false);
  const [panStart, setPanStart] = useState<Point>({ x: 0, y: 0 });

  const isLineTool = activeTool === 'wall' || activeTool === 'electrical-wire' || activeTool === 'plumbing-pipe';
  const isWallCoveringSurface = getSurfaceMaterial(selectedSurfaceMaterial)?.category === 'wall-covering';

  const screenToWorld = useCallback((sx: number, sy: number): Point => {
    return { x: (sx - offset.x) / scale, y: (sy - offset.y) / scale };
  }, [offset, scale]);

  const snapPt = useCallback((p: Point): Point => snapToGrid(p, snapSize), [snapSize]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const resize = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [canvasRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawGrid(ctx, canvas.width, canvas.height, offset, scale);

    for (const surface of surfaces) {
      if (surface.start && surface.end) {
        drawLineSurface(ctx, surface, offset, scale, surface.id === selectedSurfaceId);
      } else {
        drawSurface(ctx, surface, offset, scale, surface.id === selectedSurfaceId);
      }
    }

    for (const wall of walls) {
      drawWall(ctx, wall, offset, scale, wall.id === selectedWallId);
    }
    for (const dw of doorsWindows) {
      const wall = walls.find((w) => w.id === dw.wallId);
      if (wall) drawDoorWindow(ctx, dw, wall, offset, scale, dw.id === selectedDoorWindowId);
    }
    for (const pipe of plumbingPipes) {
      drawPlumbingPipe(ctx, pipe, offset, scale, pipe.id === selectedPipeId);
    }
    for (const wire of electricalWires) {
      drawElectricalWire(ctx, wire, offset, scale, wire.id === selectedWireId);
    }
    for (const item of furniture) {
      drawFurniture(ctx, item, offset, scale, item.id === selectedFurnitureId);
    }
    for (const pt of plumbingPoints) {
      drawPlumbingPoint(ctx, pt, offset, scale, false);
    }
    for (const pt of electricalPoints) {
      drawElectricalPoint(ctx, pt, offset, scale, false);
    }

    // Drawing preview
    if (drawing && lineStart && mousePos) {
      const snapped = snapPt(mousePos);
      if (activeTool === 'surface' && !isWallCoveringSurface) {
        // Rect surface preview
        const mat = getSurfaceMaterial(selectedSurfaceMaterial);
        const x = Math.min(lineStart.x, snapped.x) * scale + offset.x;
        const y = Math.min(lineStart.y, snapped.y) * scale + offset.y;
        const w = Math.abs(snapped.x - lineStart.x) * scale;
        const h = Math.abs(snapped.y - lineStart.y) * scale;
        ctx.save();
        ctx.fillStyle = (mat?.color || '#bbb') + '66';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#1a237e';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
        const areaM2 = (Math.abs(snapped.x - lineStart.x) / 40) * (Math.abs(snapped.y - lineStart.y) / 40);
        ctx.fillStyle = '#1a237e';
        ctx.font = `bold ${13 * scale}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(`${areaM2.toFixed(2)} m²`, x + w / 2, y + h / 2);
        ctx.restore();
      } else if (activeTool === 'surface' && isWallCoveringSurface) {
        // Line surface preview (like wall)
        const mat = getSurfaceMaterial(selectedSurfaceMaterial);
        const sx = lineStart.x * scale + offset.x;
        const sy = lineStart.y * scale + offset.y;
        const ex = snapped.x * scale + offset.x;
        const ey = snapped.y * scale + offset.y;
        ctx.save();
        ctx.strokeStyle = mat?.color || '#bbb';
        ctx.lineWidth = 6 * scale;
        ctx.lineCap = 'round';
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.setLineDash([]);
        const dx = snapped.x - lineStart.x;
        const dy = snapped.y - lineStart.y;
        const lenM = Math.sqrt(dx * dx + dy * dy) / 40;
        if (lenM > 0.05) {
          const mx = (sx + ex) / 2;
          const my = (sy + ey) / 2;
          ctx.fillStyle = '#1a237e';
          ctx.font = `bold ${14 * scale}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(`${lenM.toFixed(2)} m`, mx, my - 12 * scale);
          ctx.font = `${10 * scale}px sans-serif`;
          ctx.fillStyle = '#666';
          ctx.fillText(`Surface: ${(lenM * 2.5).toFixed(2)} m²`, mx, my + 2 * scale);
        }
        ctx.restore();
      } else {
        // Line tool preview (wall, wire, pipe)
        const colors: Record<string, string> = {
          wall: '#2196F3', 'electrical-wire': '#FFA000', 'plumbing-pipe': '#2196F3',
        };
        ctx.strokeStyle = colors[activeTool] || '#2196F3';
        ctx.lineWidth = (activeTool === 'wall' ? 8 : 3) * scale;
        ctx.lineCap = 'round';
        ctx.setLineDash([5, 5]);
        const sx = lineStart.x * scale + offset.x;
        const sy = lineStart.y * scale + offset.y;
        const ex = snapped.x * scale + offset.x;
        const ey = snapped.y * scale + offset.y;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.setLineDash([]);

        const dx = snapped.x - lineStart.x;
        const dy = snapped.y - lineStart.y;
        const lenM = Math.sqrt(dx * dx + dy * dy) / 40;
        if (lenM > 0.05) {
          const mx = (sx + ex) / 2;
          const my = (sy + ey) / 2;
          ctx.save();
          ctx.fillStyle = '#1a237e';
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 3;
          ctx.font = `bold ${14 * scale}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.strokeText(`${lenM.toFixed(2)} m`, mx, my - 12 * scale);
          ctx.fillText(`${lenM.toFixed(2)} m`, mx, my - 12 * scale);
          ctx.font = `${10 * scale}px sans-serif`;
          ctx.fillStyle = '#666';
          ctx.strokeText(`(${(lenM * 100).toFixed(0)} cm)`, mx, my - 1 * scale);
          ctx.fillText(`(${(lenM * 100).toFixed(0)} cm)`, mx, my - 1 * scale);
          ctx.restore();
        }
      }
    }
  }, [walls, furniture, doorsWindows, surfaces, electricalPoints, electricalWires, plumbingPoints, plumbingPipes, offset, scale, drawing, lineStart, mousePos, selectedWallId, selectedFurnitureId, selectedDoorWindowId, selectedSurfaceId, selectedWireId, selectedPipeId, selectedSurfaceMaterial, isWallCoveringSurface, snapPt, activeTool, canvasRef]);

  const clearSelections = () => {
    onSelectWall(null); onSelectFurniture(null); onSelectDoorWindow(null);
    onSelectSurface(null); onSelectWire(null); onSelectPipe(null);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(sx, sy);

    if (e.button === 1 || e.button === 2 || (e.button === 0 && e.altKey)) {
      setPanning(true);
      setPanStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
      return;
    }

    if (isLineTool || activeTool === 'surface') {
      const snapped = snapPt(world);
      setLineStart(snapped);
      setDrawing(true);
    } else if (activeTool === 'select') {
      // Check wall endpoints first (for selected wall)
      if (selectedWallId) {
        const selWall = walls.find((w) => w.id === selectedWallId);
        if (selWall) {
          const ep = hitTestWallEndpoint(selWall, world, 12 / scale);
          if (ep) {
            setDragMode({ type: 'wall-endpoint', id: selectedWallId, endpoint: ep });
            return;
          }
        }
      }

      // Check wire endpoints (for selected wire)
      if (selectedWireId) {
        const selWire = electricalWires.find((w) => w.id === selectedWireId);
        if (selWire) {
          const ep = hitTestWallEndpoint(selWire as unknown as Wall, world, 12 / scale);
          if (ep) {
            setDragMode({ type: 'wire-endpoint', id: selectedWireId, endpoint: ep });
            return;
          }
        }
      }

      // Check pipe endpoints (for selected pipe)
      if (selectedPipeId) {
        const selPipe = plumbingPipes.find((p) => p.id === selectedPipeId);
        if (selPipe) {
          const ep = hitTestWallEndpoint(selPipe as unknown as Wall, world, 12 / scale);
          if (ep) {
            setDragMode({ type: 'pipe-endpoint', id: selectedPipeId, endpoint: ep });
            return;
          }
        }
      }

      // Check line surface endpoints (for selected line surface)
      if (selectedSurfaceId) {
        const selSurf = surfaces.find((s) => s.id === selectedSurfaceId);
        if (selSurf?.start && selSurf?.end) {
          const ep = hitTestLineSurfaceEndpoint(selSurf, world, 12 / scale);
          if (ep) {
            setDragMode({ type: 'line-surface-endpoint', id: selectedSurfaceId, endpoint: ep });
            return;
          }
        }
      }

      // Check doors/windows
      for (const dw of doorsWindows) {
        const wall = walls.find((w) => w.id === dw.wallId);
        if (wall && hitTestDoorWindow(dw, wall, world, scale)) {
          clearSelections();
          onSelectDoorWindow(dw.id);
          return;
        }
      }

      // Check electrical points
      for (const pt of [...electricalPoints].reverse()) {
        if (hitTestPoint(pt, world, 15 / scale)) {
          setDragMode({ type: 'electrical-point', id: pt.id });
          return;
        }
      }

      // Check plumbing points
      for (const pt of [...plumbingPoints].reverse()) {
        if (hitTestPoint(pt, world, 15 / scale)) {
          setDragMode({ type: 'plumbing-point', id: pt.id });
          return;
        }
      }

      // Check electrical wires
      for (const wire of [...electricalWires].reverse()) {
        if (hitTestLine(wire, world, 10 / scale)) {
          clearSelections();
          onSelectWire(wire.id);
          setDragMode({
            type: 'wire-move', id: wire.id,
            offsetStart: { x: world.x - wire.start.x, y: world.y - wire.start.y },
            offsetEnd: { x: world.x - wire.end.x, y: world.y - wire.end.y },
          });
          return;
        }
      }

      // Check plumbing pipes
      for (const pipe of [...plumbingPipes].reverse()) {
        if (hitTestLine(pipe, world, 10 / scale)) {
          clearSelections();
          onSelectPipe(pipe.id);
          setDragMode({
            type: 'pipe-move', id: pipe.id,
            offsetStart: { x: world.x - pipe.start.x, y: world.y - pipe.start.y },
            offsetEnd: { x: world.x - pipe.end.x, y: world.y - pipe.end.y },
          });
          return;
        }
      }

      // Check furniture
      for (const item of [...furniture].reverse()) {
        if (hitTestFurniture(item, world)) {
          clearSelections();
          onSelectFurniture(item.id);
          setDragMode({ type: 'furniture', id: item.id, offsetX: world.x - item.x, offsetY: world.y - item.y });
          return;
        }
      }

      // Check walls (body drag)
      for (const wall of walls) {
        if (hitTestWall(wall, world, 10 / scale)) {
          clearSelections();
          onSelectWall(wall.id);
          setDragMode({
            type: 'wall-move', id: wall.id,
            offsetStart: { x: world.x - wall.start.x, y: world.y - wall.start.y },
            offsetEnd: { x: world.x - wall.end.x, y: world.y - wall.end.y },
          });
          return;
        }
      }

      // Check selected surface resize handle first
      if (selectedSurfaceId) {
        const selSurf = surfaces.find((s) => s.id === selectedSurfaceId);
        if (selSurf && !selSurf.start && hitTestSurfaceHandle(selSurf, world, 12 / scale)) {
          setDragMode({ type: 'surface-resize', id: selSurf.id });
          return;
        }
      }

      // Check line surfaces
      for (const surface of [...surfaces].reverse()) {
        if (surface.start && surface.end) {
          if (hitTestLineSurface(surface, world, 10 / scale)) {
            clearSelections();
            onSelectSurface(surface.id);
            setDragMode({
              type: 'line-surface-move', id: surface.id,
              offsetStart: { x: world.x - surface.start.x, y: world.y - surface.start.y },
              offsetEnd: { x: world.x - surface.end.x, y: world.y - surface.end.y },
            });
            return;
          }
        }
      }

      // Check rect surfaces — lowest priority
      for (const surface of [...surfaces].reverse()) {
        if (!surface.start && hitTestSurface(surface, world)) {
          clearSelections();
          onSelectSurface(surface.id);
          setDragMode({ type: 'surface-move', id: surface.id, offsetX: world.x - surface.x, offsetY: world.y - surface.y });
          return;
        }
      }

      clearSelections();
    } else if (activeTool === 'furniture' && selectedFurnitureType) {
      const catalog = furnitureCatalog.find((f) => f.type === selectedFurnitureType);
      if (catalog) {
        const snapped = snapPt(world);
        onAddFurniture({
          id: generateId(), type: selectedFurnitureType,
          x: snapped.x - catalog.width / 2, y: snapped.y - catalog.height / 2,
          width: catalog.width, height: catalog.height, rotation: 0, label: catalog.label,
        });
      }
    } else if (activeTool === 'electrical-point' && selectedElectricalType) {
      const catalog = electricalCatalog.find((e) => e.type === selectedElectricalType);
      if (catalog) {
        const snapped = snapPt(world);
        onAddElectricalPoint({ id: generateId(), type: selectedElectricalType, x: snapped.x, y: snapped.y, label: catalog.label, circuit: 'C1' });
      }
    } else if (activeTool === 'plumbing-point' && selectedPlumbingType) {
      const catalog = plumbingCatalog.find((p) => p.type === selectedPlumbingType);
      if (catalog) {
        const snapped = snapPt(world);
        onAddPlumbingPoint({ id: generateId(), type: selectedPlumbingType, x: snapped.x, y: snapped.y, label: catalog.label, network: catalog.network });
      }
    } else if (activeTool === 'door-window' && selectedDoorWindowType) {
      const hit = findWallAtPoint(walls, world, 30 / scale);
      if (hit) {
        const catalog = doorWindowCatalog.find((d) => d.type === selectedDoorWindowType);
        if (catalog) {
          onAddDoorWindow({
            id: generateId(), type: selectedDoorWindowType, wallId: hit.wall.id,
            position: Math.max(0.05, Math.min(0.95, hit.t)),
            width: catalog.width, height: catalog.height, label: catalog.label,
            openingDirection: 'left', openingAngle: 90,
            material: catalog.materials[0], color: '#FFFFFF',
          });
        }
      }
    } else if (activeTool === 'eraser') {
      for (const dw of doorsWindows) {
        const wall = walls.find((w) => w.id === dw.wallId);
        if (wall && hitTestDoorWindow(dw, wall, world, scale)) { onDeleteDoorWindow(dw.id); return; }
      }
      for (const pt of [...electricalPoints].reverse()) { if (hitTestPoint(pt, world, 15 / scale)) { onDeleteElectricalPoint(pt.id); return; } }
      for (const pt of [...plumbingPoints].reverse()) { if (hitTestPoint(pt, world, 15 / scale)) { onDeletePlumbingPoint(pt.id); return; } }
      for (const wire of electricalWires) { if (hitTestLine(wire, world, 10 / scale)) { onDeleteElectricalWire(wire.id); return; } }
      for (const pipe of plumbingPipes) { if (hitTestLine(pipe, world, 10 / scale)) { onDeletePlumbingPipe(pipe.id); return; } }
      for (const item of [...furniture].reverse()) { if (hitTestFurniture(item, world)) { onDeleteFurniture(item.id); return; } }
      for (const wall of walls) { if (hitTestWall(wall, world, 10 / scale)) { onDeleteWall(wall.id); return; } }
      for (const surface of [...surfaces].reverse()) {
        if (surface.start && surface.end) {
          if (hitTestLineSurface(surface, world, 10 / scale)) { onDeleteSurface(surface.id); return; }
        } else {
          if (hitTestSurface(surface, world)) { onDeleteSurface(surface.id); return; }
        }
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(sx, sy);

    if (panning) {
      setOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
      return;
    }
    if (drawing) {
      setMousePos(world);
      return;
    }

    if (dragMode) {
      const snapped = snapPt(world);
      if (dragMode.type === 'furniture') {
        const s = snapPt({ x: world.x - dragMode.offsetX, y: world.y - dragMode.offsetY });
        onMoveFurniture(dragMode.id, s.x, s.y);
      } else if (dragMode.type === 'wall-endpoint') {
        const wall = walls.find((w) => w.id === dragMode.id);
        if (wall) onUpdateWall({ ...wall, [dragMode.endpoint]: snapped });
      } else if (dragMode.type === 'wall-move') {
        const wall = walls.find((w) => w.id === dragMode.id);
        if (wall) {
          const newStart = snapPt({ x: world.x - dragMode.offsetStart.x, y: world.y - dragMode.offsetStart.y });
          const newEnd = snapPt({ x: world.x - dragMode.offsetEnd.x, y: world.y - dragMode.offsetEnd.y });
          onUpdateWall({ ...wall, start: newStart, end: newEnd });
        }
      } else if (dragMode.type === 'electrical-point') {
        onMoveElectricalPoint(dragMode.id, snapped.x, snapped.y);
      } else if (dragMode.type === 'plumbing-point') {
        onMovePlumbingPoint(dragMode.id, snapped.x, snapped.y);
      } else if (dragMode.type === 'wire-endpoint') {
        const wire = electricalWires.find((w) => w.id === dragMode.id);
        if (wire) onUpdateWire({ ...wire, [dragMode.endpoint]: snapped });
      } else if (dragMode.type === 'wire-move') {
        const wire = electricalWires.find((w) => w.id === dragMode.id);
        if (wire) {
          onUpdateWire({
            ...wire,
            start: snapPt({ x: world.x - dragMode.offsetStart.x, y: world.y - dragMode.offsetStart.y }),
            end: snapPt({ x: world.x - dragMode.offsetEnd.x, y: world.y - dragMode.offsetEnd.y }),
          });
        }
      } else if (dragMode.type === 'pipe-endpoint') {
        const pipe = plumbingPipes.find((p) => p.id === dragMode.id);
        if (pipe) onUpdatePipe({ ...pipe, [dragMode.endpoint]: snapped });
      } else if (dragMode.type === 'pipe-move') {
        const pipe = plumbingPipes.find((p) => p.id === dragMode.id);
        if (pipe) {
          onUpdatePipe({
            ...pipe,
            start: snapPt({ x: world.x - dragMode.offsetStart.x, y: world.y - dragMode.offsetStart.y }),
            end: snapPt({ x: world.x - dragMode.offsetEnd.x, y: world.y - dragMode.offsetEnd.y }),
          });
        }
      } else if (dragMode.type === 'line-surface-endpoint') {
        const surface = surfaces.find((s) => s.id === dragMode.id);
        if (surface?.start && surface?.end) {
          onUpdateSurface({ ...surface, [dragMode.endpoint]: snapped });
        }
      } else if (dragMode.type === 'line-surface-move') {
        const surface = surfaces.find((s) => s.id === dragMode.id);
        if (surface?.start && surface?.end) {
          onUpdateSurface({
            ...surface,
            start: snapPt({ x: world.x - dragMode.offsetStart.x, y: world.y - dragMode.offsetStart.y }),
            end: snapPt({ x: world.x - dragMode.offsetEnd.x, y: world.y - dragMode.offsetEnd.y }),
          });
        }
      } else if (dragMode.type === 'surface-move') {
        const surface = surfaces.find((s) => s.id === dragMode.id);
        if (surface) {
          const s = snapPt({ x: world.x - dragMode.offsetX, y: world.y - dragMode.offsetY });
          onUpdateSurface({ ...surface, x: s.x, y: s.y });
        }
      } else if (dragMode.type === 'surface-resize') {
        const surface = surfaces.find((s) => s.id === dragMode.id);
        if (surface) {
          onUpdateSurface({
            ...surface,
            width: Math.max(8, snapped.x - surface.x),
            height: Math.max(8, snapped.y - surface.y),
          });
        }
      }
    }
  };

  const handleMouseUp = () => {
    if (panning) { setPanning(false); return; }

    if (drawing && lineStart && mousePos) {
      const snapped = snapPt(mousePos);
      const dx = snapped.x - lineStart.x;
      const dy = snapped.y - lineStart.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (activeTool === 'surface') {
        if (isWallCoveringSurface) {
          // Line-mode surface for wall coverings
          if (dist > 10) {
            const surf: Surface = {
              id: generateId(),
              category: 'wall-covering',
              material: selectedSurfaceMaterial,
              x: 0, y: 0, width: 0, height: 0,
              start: { ...lineStart },
              end: { ...snapped },
              wallHeight: 2.5,
            };
            onAddSurface(surf);
            onSelectSurface(surf.id);
          }
        } else {
          // Rect surface for floor/ceiling
          const w = Math.abs(dx);
          const h = Math.abs(dy);
          if (w > 8 && h > 8) {
            const surf: Surface = {
              id: generateId(),
              category: getSurfaceMaterial(selectedSurfaceMaterial)?.category || 'floor',
              material: selectedSurfaceMaterial,
              x: Math.min(lineStart.x, snapped.x),
              y: Math.min(lineStart.y, snapped.y),
              width: w, height: h,
            };
            onAddSurface(surf);
            onSelectSurface(surf.id);
          }
        }
      } else if (dist > 10) {
        if (activeTool === 'wall') {
          onAddWall({ id: generateId(), start: lineStart, end: snapped, thickness: 8 });
        } else if (activeTool === 'electrical-wire') {
          onAddElectricalWire({ id: generateId(), start: lineStart, end: snapped, circuit: 'C1', gauge: selectedWireGauge });
        } else if (activeTool === 'plumbing-pipe') {
          onAddPlumbingPipe({ id: generateId(), start: lineStart, end: snapped, network: selectedPipeNetwork, diameter: selectedPipeDiameter });
        }
      }
    }
    setDrawing(false);
    setLineStart(null);
    setMousePos(null);
    setDragMode(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const zoom = e.deltaY < 0 ? 1.1 : 0.9;
    const newScale = Math.max(0.2, Math.min(5, scale * zoom));
    setOffset({
      x: mx - (mx - offset.x) * (newScale / scale),
      y: my - (my - offset.y) * (newScale / scale),
    });
    setScale(newScale);
  };

  const getCursor = () => {
    if (dragMode?.type === 'wall-endpoint' || dragMode?.type === 'wire-endpoint' || dragMode?.type === 'pipe-endpoint' || dragMode?.type === 'line-surface-endpoint') return 'grab';
    if (dragMode?.type === 'wall-move' || dragMode?.type === 'surface-move' || dragMode?.type === 'wire-move' || dragMode?.type === 'pipe-move' || dragMode?.type === 'line-surface-move') return 'move';
    if (dragMode?.type === 'surface-resize') return 'nwse-resize';
    const map: Partial<Record<Tool, string>> = {
      wall: 'crosshair', 'electrical-wire': 'crosshair', 'plumbing-pipe': 'crosshair',
      'electrical-point': 'crosshair', 'plumbing-point': 'crosshair',
      eraser: 'pointer', furniture: 'crosshair', 'door-window': 'crosshair', surface: 'crosshair',
    };
    return map[activeTool] || 'default';
  };

  return (
    <div ref={containerRef} className="canvas-container">
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
        style={{ cursor: getCursor() }}
      />
      <div className="zoom-info">Zoom: {Math.round(scale * 100)}%</div>
    </div>
  );
}
