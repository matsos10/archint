import { useRef, useEffect, useState, useCallback } from 'react';
import type { Wall, FurnitureItem, Tool, Point, FurnitureType } from '../types';
import { drawGrid, drawWall, drawFurniture, snapToGrid, hitTestWall, hitTestFurniture } from '../utils/canvas';
import { furnitureCatalog } from '../utils/furniture-catalog';
import { generateId } from '../utils/id';

interface CanvasProps {
  walls: Wall[];
  furniture: FurnitureItem[];
  activeTool: Tool;
  selectedFurnitureType: FurnitureType | null;
  selectedWallId: string | null;
  selectedFurnitureId: string | null;
  onAddWall: (wall: Wall) => void;
  onAddFurniture: (item: FurnitureItem) => void;
  onSelectWall: (id: string | null) => void;
  onSelectFurniture: (id: string | null) => void;
  onMoveFurniture: (id: string, x: number, y: number) => void;
  onDeleteWall: (id: string) => void;
  onDeleteFurniture: (id: string) => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export function Canvas({
  walls, furniture, activeTool, selectedFurnitureType,
  selectedWallId, selectedFurnitureId,
  onAddWall, onAddFurniture, onSelectWall, onSelectFurniture,
  onMoveFurniture, onDeleteWall, onDeleteFurniture, canvasRef,
}: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [drawing, setDrawing] = useState(false);
  const [wallStart, setWallStart] = useState<Point | null>(null);
  const [mousePos, setMousePos] = useState<Point | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<Point>({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const [panStart, setPanStart] = useState<Point>({ x: 0, y: 0 });

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
    for (const item of furniture) {
      drawFurniture(ctx, item, offset, scale, item.id === selectedFurnitureId);
    }

    if (drawing && wallStart && mousePos) {
      const snapped = snapToGrid(mousePos);
      ctx.strokeStyle = '#2196F3';
      ctx.lineWidth = 8 * scale;
      ctx.lineCap = 'round';
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(wallStart.x * scale + offset.x, wallStart.y * scale + offset.y);
      ctx.lineTo(snapped.x * scale + offset.x, snapped.y * scale + offset.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [walls, furniture, offset, scale, drawing, wallStart, mousePos, selectedWallId, selectedFurnitureId, canvasRef]);

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

    if (activeTool === 'wall') {
      const snapped = snapToGrid(world);
      setWallStart(snapped);
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
    } else if (activeTool === 'eraser') {
      for (const item of [...furniture].reverse()) {
        if (hitTestFurniture(item, world)) {
          onDeleteFurniture(item.id);
          return;
        }
      }
      for (const wall of walls) {
        if (hitTestWall(wall, world, 10 / scale)) {
          onDeleteWall(wall.id);
          return;
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
    }

    if (dragging) {
      const snapped = snapToGrid({ x: world.x - dragOffset.x, y: world.y - dragOffset.y });
      onMoveFurniture(dragging, snapped.x, snapped.y);
    }
  };

  const handleMouseUp = () => {
    if (panning) {
      setPanning(false);
      return;
    }

    if (drawing && wallStart && mousePos) {
      const snapped = snapToGrid(mousePos);
      const dx = snapped.x - wallStart.x;
      const dy = snapped.y - wallStart.y;
      if (Math.sqrt(dx * dx + dy * dy) > 10) {
        onAddWall({
          id: generateId(),
          start: wallStart,
          end: snapped,
          thickness: 8,
        });
      }
    }
    setDrawing(false);
    setWallStart(null);
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

  return (
    <div ref={containerRef} className="canvas-container">
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{ cursor: activeTool === 'wall' ? 'crosshair' : activeTool === 'eraser' ? 'pointer' : 'default' }}
      />
      <div className="zoom-info">Zoom: {Math.round(scale * 100)}%</div>
    </div>
  );
}
