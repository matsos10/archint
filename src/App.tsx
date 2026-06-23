import { useState, useRef, useCallback } from 'react';
import type { Wall, FurnitureItem, Tool, FurnitureType, FloorPlan } from './types';
import { Toolbar } from './components/Toolbar';
import { Canvas } from './components/Canvas';
import { FurniturePanel } from './components/FurniturePanel';
import { PropertiesPanel } from './components/PropertiesPanel';
import { generateId } from './utils/id';

function App() {
  const [walls, setWalls] = useState<Wall[]>([]);
  const [furniture, setFurniture] = useState<FurnitureItem[]>([]);
  const [activeTool, setActiveTool] = useState<Tool>('select');
  const [selectedFurnitureType, setSelectedFurnitureType] = useState<FurnitureType | null>(null);
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [selectedFurnitureId, setSelectedFurnitureId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const selectedWall = walls.find((w) => w.id === selectedWallId) || null;
  const selectedFurnitureItem = furniture.find((f) => f.id === selectedFurnitureId) || null;

  const handleToolChange = (tool: Tool) => {
    setActiveTool(tool);
    if (tool === 'furniture') {
      setSelectedFurnitureType(selectedFurnitureType || 'sofa');
    }
  };

  const handleSave = () => {
    const plan: FloorPlan = {
      id: generateId(),
      name: 'Mon plan',
      walls,
      furniture,
      gridSize: 20,
    };
    const blob = new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plan-architecture.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLoad = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const plan: FloorPlan = JSON.parse(ev.target!.result as string);
        setWalls(plan.walls);
        setFurniture(plan.furniture);
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleExport = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plan-architecture.png';
    a.click();
  };

  const handleClear = () => {
    if (confirm('Êtes-vous sûr de vouloir tout effacer ?')) {
      setWalls([]);
      setFurniture([]);
      setSelectedWallId(null);
      setSelectedFurnitureId(null);
    }
  };

  const handleUpdateWall = useCallback((wall: Wall) => {
    setWalls((prev) => prev.map((w) => (w.id === wall.id ? wall : w)));
  }, []);

  const handleUpdateFurniture = useCallback((item: FurnitureItem) => {
    setFurniture((prev) => prev.map((f) => (f.id === item.id ? item : f)));
  }, []);

  const handleDelete = () => {
    if (selectedWallId) {
      setWalls((prev) => prev.filter((w) => w.id !== selectedWallId));
      setSelectedWallId(null);
    }
    if (selectedFurnitureId) {
      setFurniture((prev) => prev.filter((f) => f.id !== selectedFurnitureId));
      setSelectedFurnitureId(null);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>ArchInt — Plans d'Architecture Intérieure</h1>
      </header>
      <Toolbar
        activeTool={activeTool}
        onToolChange={handleToolChange}
        onSave={handleSave}
        onLoad={handleLoad}
        onExport={handleExport}
        onClear={handleClear}
      />
      <div className="main-content">
        <FurniturePanel
          visible={activeTool === 'furniture'}
          onSelect={setSelectedFurnitureType}
          selectedFurnitureType={selectedFurnitureType}
        />
        <Canvas
          walls={walls}
          furniture={furniture}
          activeTool={activeTool}
          selectedFurnitureType={selectedFurnitureType}
          selectedWallId={selectedWallId}
          selectedFurnitureId={selectedFurnitureId}
          onAddWall={(w) => setWalls((prev) => [...prev, w])}
          onAddFurniture={(f) => setFurniture((prev) => [...prev, f])}
          onSelectWall={setSelectedWallId}
          onSelectFurniture={setSelectedFurnitureId}
          onMoveFurniture={(id, x, y) =>
            setFurniture((prev) => prev.map((f) => (f.id === id ? { ...f, x, y } : f)))
          }
          onDeleteWall={(id) => setWalls((prev) => prev.filter((w) => w.id !== id))}
          onDeleteFurniture={(id) => setFurniture((prev) => prev.filter((f) => f.id !== id))}
          canvasRef={canvasRef}
        />
        <PropertiesPanel
          selectedWall={selectedWall}
          selectedFurniture={selectedFurnitureItem}
          onUpdateWall={handleUpdateWall}
          onUpdateFurniture={handleUpdateFurniture}
          onDelete={handleDelete}
        />
      </div>
    </div>
  );
}

export default App;
