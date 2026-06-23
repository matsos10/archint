import { useRef, useEffect, useState, useCallback } from 'react';
import type { Wall, FurnitureItem, Tool, Point, FurnitureType, ElectricalPoint, ElectricalWire, PlumbingPoint, PlumbingPipe, ElectricalType, PlumbingType } from '../types';
import { drawGrid, drawWall, drawFurniture, drawElectricalPoint, drawElectricalWire, drawPlumbingPoint, drawPlumbingPipe, snapToGrid, hitTestWall, hitTestFurniture, hitTestPoint, hitTestLine } from '../utils/canvas';
import { furnitureCatalog } from '../utils/furniture-catalog';
import { electricalCatalog } from '../utils/electrical-catalog';
import { plumbingCatalog } from '../utils/plumbing-catalog';
import { generateId } from '../utils/id';

interface CanvasProps {
  walls: Wall[];
  furniture: FurnitureItem[];
  electricalPoints: ElectricalPoint[];
  electricalWires: ElectricalWire[];
  plumbingPoints: PlumbingPoint[];
  plumbingPipes: PlumbingPipe[];
  activeTool: Tool;
  selectedFurnitureType: FurnitureType | null;
  selectedElectricalType: ElectricalType | null;
  selectedPlumbingType: PlumbingType | null;
  selectedWireGauge: string;
  selectedPipeDiameter: number;
  selectedPipeNetwork: 'supply' | 'hot' | 'drain';
  selectedWallId: string | null;
  selectedFurnitureId: string | null;
  onAddWall: (wall: Wall) => void;
  onAddFurniture: (item: FurnitureItem) => void;
  onAddElectricalPoint: (pt: ElectricalPoint) => void;
  onAddElectricalWire: (wire: ElectricalWire) => void;
  onAddPlumbingPoint: (pt: PlumbingPoint) => void;
  onAddPlumbingPipe: (pipe: PlumbingPipe) => void;
  onSelectWall: (id: string | null) => void;
  onSelectFurniture: (id: string | null) => void;
  onMoveFurniture: (id: string, x: number, y: number) => void;
  onDeleteWall: (id: string) => void;
  onDeleteFurniture: (id: string) => void;
  onDeleteElectricalPoint: (id: string) => void;
  onDeleteElectricalWire: (id: string) => void;
  onDeletePlumbingPoint: (id: string) => void;
  onDeletePlumbingPipe: (id: string) => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export function Canvas({
  walls, furniture, electricalPoints, electricalWires, plumbingPoints, plumbingPipes,
  activeTool, selectedFurnitureType, selectedElectricalType, selectedPlumbingType,
  selectedWireGauge, selectedPipeDiameter, selectedPipeNetwork,
  selectedWallId, selectedFurnitureId,
  onAddWall, onAddFurniture, onAddElectricalPoint, onAddElectricalWire,
  onAddPlumbingPoint, onAddPlumbingPipe,
  onSelectWall, onSelectFurniture,
  onMoveFurniture, onDeleteWall, onDeleteFurniture,
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
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<Point>({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const [panStart, setPanStart] = useState<Point>({ x: 0, y: 0 });

  const isLineTool = activeTool === 'wall' || activeTool === 'electrical-wire' || activeTool === 'plumbing-pipe';

  const screenToWorld = useCallback((sx: number, sy: number): Point => {
    return { x: (sx - offset.x) / scale, y: (sy - offset.y) / scale };
  }, [offset, scale]);

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

    for (const wall of walls) {
      drawWall(ctx, wall, offset, scale, wall.id === selectedWallId);
    }
    for (const pipe of plumbingPipes) {
      drawPlumbingPipe(ctx, pipe, offset, scale, false);
    }
    for (const wire of electricalWires) {
      drawElectricalWire(ctx, wire, offset, scale, false);
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

    if (drawing && lineStart && mousePos) {
      const snapped = snapToGrid(mousePos);
      const colors: Record<string, string> = {
        wall: '#2196F3',
        'electrical-wire': '#FFA000',
        'plumbing-pipe': '#2196F3',
      };
      ctx.strokeStyle = colors[activeTool] || '#2196F3';
      ctx.lineWidth = (activeTool === 'wall' ? 8 : 3) * scale;
      ctx.lineCap = 'round';
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(lineStart.x * scale + offset.x, lineStart.y * scale + offset.y);
      ctx.lineTo(snapped.x * scale + offset.x, snapped.y * scale + offset.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [walls, furniture, electricalPoints, electricalWires, plumbingPoints, plumbingPipes, offset, scale, drawing, lineStart, mousePos, selectedWallId, selectedFurnitureId, activeTool, canvasRef]);

  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(sx, sy);

    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setPanning(true);
      setPanStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
      return;
    }

    if (isLineTool) {
      const snapped = snapToGrid(world);
      setLineStart(snapped);
      setDrawing(true);
    } else if (activeTool === 'select') {
      for (const item of [...furniture].reverse()) {
        if (hitTestFurniture(item, world)) {
          onSelectFurniture(item.id);
          onSelectWall(null);
          setDragging(item.id);
          setDragOffset({ x: world.x - item.x, y: world.y - item.y });
          return;
        }
      }
      for (const wall of walls) {
        if (hitTestWall(wall, world, 10 / scale)) {
          onSelectWall(wall.id);
          onSelectFurniture(null);
          return;
        }
      }
      onSelectWall(null);
      onSelectFurniture(null);
    } else if (activeTool === 'furniture' && selectedFurnitureType) {
      const catalog = furnitureCatalog.find((f) => f.type === selectedFurnitureType);
      if (catalog) {
        const snapped = snapToGrid(world);
        onAddFurniture({
          id: generateId(),
          type: selectedFurnitureType,
          x: snapped.x - catalog.width / 2,
          y: snapped.y - catalog.height / 2,
          width: catalog.width,
          height: catalog.height,
          rotation: 0,
          label: catalog.label,
        });
      }
    } else if (activeTool === 'electrical-point' && selectedElectricalType) {
      const catalog = electricalCatalog.find((e) => e.type === selectedElectricalType);
      if (catalog) {
        const snapped = snapToGrid(world);
        onAddElectricalPoint({
          id: generateId(),
          type: selectedElectricalType,
          x: snapped.x,
          y: snapped.y,
          label: catalog.label,
          circuit: 'C1',
        });
      }
    } else if (activeTool === 'plumbing-point' && selectedPlumbingType) {
      const catalog = plumbingCatalog.find((p) => p.type === selectedPlumbingType);
      if (catalog) {
        const snapped = snapToGrid(world);
        onAddPlumbingPoint({
          id: generateId(),
          type: selectedPlumbingType,
          x: snapped.x,
          y: snapped.y,
          label: catalog.label,
          network: catalog.network,
        });
      }
    } else if (activeTool === 'eraser') {
      for (const pt of [...electricalPoints].reverse()) {
        if (hitTestPoint(pt, world, 15 / scale)) { onDeleteElectricalPoint(pt.id); return; }
      }
      for (const pt of [...plumbingPoints].reverse()) {
        if (hitTestPoint(pt, world, 15 / scale)) { onDeletePlumbingPoint(pt.id); return; }
      }
      for (const wire of electricalWires) {
        if (hitTestLine(wire, world, 10 / scale)) { onDeleteElectricalWire(wire.id); return; }
      }
      for (const pipe of plumbingPipes) {
        if (hitTestLine(pipe, world, 10 / scale)) { onDeletePlumbingPipe(pipe.id); return; }
      }
      for (const item of [...furniture].reverse()) {
        if (hitTestFurniture(item, world)) { onDeleteFurniture(item.id); return; }
      }
      for (const wall of walls) {
        if (hitTestWall(wall, world, 10 / scale)) { onDeleteWall(wall.id); return; }
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
    }
    if (dragging) {
      const snapped = snapToGrid({ x: world.x - dragOffset.x, y: world.y - dragOffset.y });
      onMoveFurniture(dragging, snapped.x, snapped.y);
    }
  };

  const handleMouseUp = () => {
    if (panning) { setPanning(false); return; }

    if (drawing && lineStart && mousePos) {
      const snapped = snapToGrid(mousePos);
      const dx = snapped.x - lineStart.x;
      const dy = snapped.y - lineStart.y;
      if (Math.sqrt(dx * dx + dy * dy) > 10) {
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
    setDragging(null);
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

  const cursorMap: Partial<Record<Tool, string>> = {
    wall: 'crosshair', 'electrical-wire': 'crosshair', 'plumbing-pipe': 'crosshair',
    'electrical-point': 'crosshair', 'plumbing-point': 'crosshair',
    eraser: 'pointer', furniture: 'crosshair',
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
        style={{ cursor: cursorMap[activeTool] || 'default' }}
      />
      <div className="zoom-info">Zoom: {Math.round(scale * 100)}%</div>
    </div>
  );
}
