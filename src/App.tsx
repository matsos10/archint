import { useState, useRef, useCallback, useMemo } from 'react';
import type { Wall, FurnitureItem, Tool, FurnitureType, FloorPlan, ElectricalPoint, ElectricalWire, PlumbingPoint, PlumbingPipe, ElectricalType, PlumbingType } from './types';
import { Toolbar } from './components/Toolbar';
import { Canvas } from './components/Canvas';
import { FurniturePanel } from './components/FurniturePanel';
import { ElectricalPanel } from './components/ElectricalPanel';
import { PlumbingPanel } from './components/PlumbingPanel';
import { PropertiesPanel } from './components/PropertiesPanel';
import { MaterialsPanel } from './components/MaterialsPanel';
import { calculateMaterials } from './utils/material-calculator';
import { generateId } from './utils/id';

function App() {
  const [walls, setWalls] = useState<Wall[]>([]);
  const [furniture, setFurniture] = useState<FurnitureItem[]>([]);
  const [electricalPoints, setElectricalPoints] = useState<ElectricalPoint[]>([]);
  const [electricalWires, setElectricalWires] = useState<ElectricalWire[]>([]);
  const [plumbingPoints, setPlumbingPoints] = useState<PlumbingPoint[]>([]);
  const [plumbingPipes, setPlumbingPipes] = useState<PlumbingPipe[]>([]);

  const [activeTool, setActiveTool] = useState<Tool>('select');
  const [selectedFurnitureType, setSelectedFurnitureType] = useState<FurnitureType | null>(null);
  const [selectedElectricalType, setSelectedElectricalType] = useState<ElectricalType | null>('outlet');
  const [selectedPlumbingType, setSelectedPlumbingType] = useState<PlumbingType | null>('water-supply');
  const [selectedWireGauge, setSelectedWireGauge] = useState('2.5 mm²');
  const [selectedPipeDiameter, setSelectedPipeDiameter] = useState(16);
  const [selectedPipeNetwork, setSelectedPipeNetwork] = useState<'supply' | 'hot' | 'drain'>('supply');

  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [selectedFurnitureId, setSelectedFurnitureId] = useState<string | null>(null);
  const [showMaterials, setShowMaterials] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const selectedWall = walls.find((w) => w.id === selectedWallId) || null;
  const selectedFurnitureItem = furniture.find((f) => f.id === selectedFurnitureId) || null;

  const materials = useMemo(
    () => calculateMaterials(electricalPoints, electricalWires, plumbingPoints, plumbingPipes),
    [electricalPoints, electricalWires, plumbingPoints, plumbingPipes],
  );

  const handleToolChange = (tool: Tool) => {
    setActiveTool(tool);
    if (tool === 'furniture') setSelectedFurnitureType(selectedFurnitureType || 'sofa');
  };

  const handleSave = () => {
    const plan: FloorPlan = {
      id: generateId(), name: 'Mon plan', walls, furniture,
      electricalPoints, electricalWires, plumbingPoints, plumbingPipes, gridSize: 20,
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
        setElectricalPoints(plan.electricalPoints || []);
        setElectricalWires(plan.electricalWires || []);
        setPlumbingPoints(plan.plumbingPoints || []);
        setPlumbingPipes(plan.plumbingPipes || []);
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
      setWalls([]); setFurniture([]);
      setElectricalPoints([]); setElectricalWires([]);
      setPlumbingPoints([]); setPlumbingPipes([]);
      setSelectedWallId(null); setSelectedFurnitureId(null);
    }
  };

  const handleUpdateWall = useCallback((wall: Wall) => {
    setWalls((prev) => prev.map((w) => (w.id === wall.id ? wall : w)));
  }, []);

  const handleUpdateFurniture = useCallback((item: FurnitureItem) => {
    setFurniture((prev) => prev.map((f) => (f.id === item.id ? item : f)));
  }, []);

  const handleDelete = () => {
    if (selectedWallId) { setWalls((prev) => prev.filter((w) => w.id !== selectedWallId)); setSelectedWallId(null); }
    if (selectedFurnitureId) { setFurniture((prev) => prev.filter((f) => f.id !== selectedFurnitureId)); setSelectedFurnitureId(null); }
  };

  const showElecPanel = activeTool === 'electrical-point' || activeTool === 'electrical-wire';
  const showPlumbPanel = activeTool === 'plumbing-point' || activeTool === 'plumbing-pipe';

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
        onShowMaterials={() => setShowMaterials(true)}
      />
      <div className="main-content">
        <FurniturePanel
          visible={activeTool === 'furniture'}
          onSelect={setSelectedFurnitureType}
          selectedFurnitureType={selectedFurnitureType}
        />
        <ElectricalPanel
          visible={showElecPanel}
          activeTool={activeTool}
          selectedType={selectedElectricalType}
          selectedGauge={selectedWireGauge}
          onSelectType={setSelectedElectricalType}
          onSelectGauge={setSelectedWireGauge}
          onSetTool={setActiveTool}
        />
        <PlumbingPanel
          visible={showPlumbPanel}
          activeTool={activeTool}
          selectedType={selectedPlumbingType}
          selectedDiameter={selectedPipeDiameter}
          selectedNetwork={selectedPipeNetwork}
          onSelectType={setSelectedPlumbingType}
          onSelectDiameter={setSelectedPipeDiameter}
          onSelectNetwork={setSelectedPipeNetwork}
          onSetTool={setActiveTool}
        />
        <Canvas
          walls={walls}
          furniture={furniture}
          electricalPoints={electricalPoints}
          electricalWires={electricalWires}
          plumbingPoints={plumbingPoints}
          plumbingPipes={plumbingPipes}
          activeTool={activeTool}
          selectedFurnitureType={selectedFurnitureType}
          selectedElectricalType={selectedElectricalType}
          selectedPlumbingType={selectedPlumbingType}
          selectedWireGauge={selectedWireGauge}
          selectedPipeDiameter={selectedPipeDiameter}
          selectedPipeNetwork={selectedPipeNetwork}
          selectedWallId={selectedWallId}
          selectedFurnitureId={selectedFurnitureId}
          onAddWall={(w) => setWalls((prev) => [...prev, w])}
          onAddFurniture={(f) => setFurniture((prev) => [...prev, f])}
          onAddElectricalPoint={(pt) => setElectricalPoints((prev) => [...prev, pt])}
          onAddElectricalWire={(w) => setElectricalWires((prev) => [...prev, w])}
          onAddPlumbingPoint={(pt) => setPlumbingPoints((prev) => [...prev, pt])}
          onAddPlumbingPipe={(p) => setPlumbingPipes((prev) => [...prev, p])}
          onSelectWall={setSelectedWallId}
          onSelectFurniture={setSelectedFurnitureId}
          onMoveFurniture={(id, x, y) => setFurniture((prev) => prev.map((f) => (f.id === id ? { ...f, x, y } : f)))}
          onDeleteWall={(id) => setWalls((prev) => prev.filter((w) => w.id !== id))}
          onDeleteFurniture={(id) => setFurniture((prev) => prev.filter((f) => f.id !== id))}
          onDeleteElectricalPoint={(id) => setElectricalPoints((prev) => prev.filter((p) => p.id !== id))}
          onDeleteElectricalWire={(id) => setElectricalWires((prev) => prev.filter((w) => w.id !== id))}
          onDeletePlumbingPoint={(id) => setPlumbingPoints((prev) => prev.filter((p) => p.id !== id))}
          onDeletePlumbingPipe={(id) => setPlumbingPipes((prev) => prev.filter((p) => p.id !== id))}
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
      <MaterialsPanel
        materials={materials}
        visible={showMaterials}
        onClose={() => setShowMaterials(false)}
      />
    </div>
  );
}

export default App;
