import { useState, useRef, useCallback, useMemo } from 'react';
import type { Wall, FurnitureItem, Tool, FurnitureType, FloorPlan, ElectricalPoint, ElectricalWire, PlumbingPoint, PlumbingPipe, ElectricalType, PlumbingType, DoorWindow, DoorWindowType } from './types';
import { Toolbar } from './components/Toolbar';
import { Canvas } from './components/Canvas';
import { View3D } from './components/View3D';
import { FurniturePanel } from './components/FurniturePanel';
import { DoorWindowPanel } from './components/DoorWindowPanel';
import { ElectricalPanel } from './components/ElectricalPanel';
import { PlumbingPanel } from './components/PlumbingPanel';
import { PropertiesPanel } from './components/PropertiesPanel';
import { MaterialsPanel } from './components/MaterialsPanel';
import { calculateMaterials } from './utils/material-calculator';
import { generateId } from './utils/id';

function App() {
  const [walls, setWalls] = useState<Wall[]>([]);
  const [furniture, setFurniture] = useState<FurnitureItem[]>([]);
  const [doorsWindows, setDoorsWindows] = useState<DoorWindow[]>([]);
  const [electricalPoints, setElectricalPoints] = useState<ElectricalPoint[]>([]);
  const [electricalWires, setElectricalWires] = useState<ElectricalWire[]>([]);
  const [plumbingPoints, setPlumbingPoints] = useState<PlumbingPoint[]>([]);
  const [plumbingPipes, setPlumbingPipes] = useState<PlumbingPipe[]>([]);

  const [activeTool, setActiveTool] = useState<Tool>('select');
  const [selectedFurnitureType, setSelectedFurnitureType] = useState<FurnitureType | null>(null);
  const [selectedElectricalType, setSelectedElectricalType] = useState<ElectricalType | null>('outlet');
  const [selectedPlumbingType, setSelectedPlumbingType] = useState<PlumbingType | null>('water-supply');
  const [selectedDoorWindowType, setSelectedDoorWindowType] = useState<DoorWindowType | null>('door-interior');
  const [selectedWireGauge, setSelectedWireGauge] = useState('2.5 mm²');
  const [selectedPipeDiameter, setSelectedPipeDiameter] = useState(16);
  const [selectedPipeNetwork, setSelectedPipeNetwork] = useState<'supply' | 'hot' | 'drain'>('supply');

  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [selectedFurnitureId, setSelectedFurnitureId] = useState<string | null>(null);
  const [selectedDoorWindowId, setSelectedDoorWindowId] = useState<string | null>(null);
  const [showMaterials, setShowMaterials] = useState(false);
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
  const [showElectrical3D, setShowElectrical3D] = useState(true);
  const [showPlumbing3D, setShowPlumbing3D] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const selectedWall = walls.find((w) => w.id === selectedWallId) || null;
  const selectedFurnitureItem = furniture.find((f) => f.id === selectedFurnitureId) || null;
  const selectedDoorWindow = doorsWindows.find((d) => d.id === selectedDoorWindowId) || null;

  const materials = useMemo(
    () => calculateMaterials(walls, electricalPoints, electricalWires, plumbingPoints, plumbingPipes),
    [walls, electricalPoints, electricalWires, plumbingPoints, plumbingPipes],
  );

  const handleToolChange = (tool: Tool) => {
    setActiveTool(tool);
    if (tool === 'furniture') setSelectedFurnitureType(selectedFurnitureType || 'sofa');
    if (tool === 'door-window') setSelectedDoorWindowType(selectedDoorWindowType || 'door-interior');
  };

  const handleSave = () => {
    const plan: FloorPlan = {
      id: generateId(), name: 'Mon plan', walls, furniture, doorsWindows,
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
        setDoorsWindows(plan.doorsWindows || []);
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
      setWalls([]); setFurniture([]); setDoorsWindows([]);
      setElectricalPoints([]); setElectricalWires([]);
      setPlumbingPoints([]); setPlumbingPipes([]);
      setSelectedWallId(null); setSelectedFurnitureId(null); setSelectedDoorWindowId(null);
    }
  };

  const handleUpdateWall = useCallback((wall: Wall) => {
    setWalls((prev) => prev.map((w) => (w.id === wall.id ? wall : w)));
  }, []);

  const handleUpdateFurniture = useCallback((item: FurnitureItem) => {
    setFurniture((prev) => prev.map((f) => (f.id === item.id ? item : f)));
  }, []);

  const handleUpdateDoorWindow = useCallback((dw: DoorWindow) => {
    setDoorsWindows((prev) => prev.map((d) => (d.id === dw.id ? dw : d)));
  }, []);

  const handleDelete = () => {
    if (selectedWallId) {
      setDoorsWindows((prev) => prev.filter((d) => d.wallId !== selectedWallId));
      setWalls((prev) => prev.filter((w) => w.id !== selectedWallId));
      setSelectedWallId(null);
    }
    if (selectedFurnitureId) { setFurniture((prev) => prev.filter((f) => f.id !== selectedFurnitureId)); setSelectedFurnitureId(null); }
  };

  const showElecPanel = activeTool === 'electrical-point' || activeTool === 'electrical-wire';
  const showPlumbPanel = activeTool === 'plumbing-point' || activeTool === 'plumbing-pipe';

  return (
    <div className="app">
      <header className="app-header">
        <h1>ArchInt — Plans d'Architecture Intérieure</h1>
        <div className="view-toggle">
          <button className={`view-btn ${viewMode === '2d' ? 'active' : ''}`} onClick={() => setViewMode('2d')}>2D</button>
          <button className={`view-btn ${viewMode === '3d' ? 'active' : ''}`} onClick={() => setViewMode('3d')}>3D</button>
        </div>
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
        {viewMode === '2d' && (
          <>
            <FurniturePanel
              visible={activeTool === 'furniture'}
              onSelect={setSelectedFurnitureType}
              selectedFurnitureType={selectedFurnitureType}
            />
            <DoorWindowPanel
              visible={activeTool === 'door-window' || selectedDoorWindowId !== null}
              selectedType={selectedDoorWindowType}
              selectedItem={selectedDoorWindow}
              walls={walls}
              onSelectType={setSelectedDoorWindowType}
              onUpdateItem={handleUpdateDoorWindow}
              onDeleteItem={(id) => { setDoorsWindows((prev) => prev.filter((d) => d.id !== id)); setSelectedDoorWindowId(null); }}
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
              doorsWindows={doorsWindows}
              electricalPoints={electricalPoints}
              electricalWires={electricalWires}
              plumbingPoints={plumbingPoints}
              plumbingPipes={plumbingPipes}
              activeTool={activeTool}
              selectedFurnitureType={selectedFurnitureType}
              selectedElectricalType={selectedElectricalType}
              selectedPlumbingType={selectedPlumbingType}
              selectedDoorWindowType={selectedDoorWindowType}
              selectedWireGauge={selectedWireGauge}
              selectedPipeDiameter={selectedPipeDiameter}
              selectedPipeNetwork={selectedPipeNetwork}
              selectedWallId={selectedWallId}
              selectedFurnitureId={selectedFurnitureId}
              selectedDoorWindowId={selectedDoorWindowId}
              onAddWall={(w) => setWalls((prev) => [...prev, w])}
              onAddFurniture={(f) => setFurniture((prev) => [...prev, f])}
              onAddDoorWindow={(dw) => setDoorsWindows((prev) => [...prev, dw])}
              onAddElectricalPoint={(pt) => setElectricalPoints((prev) => [...prev, pt])}
              onAddElectricalWire={(w) => setElectricalWires((prev) => [...prev, w])}
              onAddPlumbingPoint={(pt) => setPlumbingPoints((prev) => [...prev, pt])}
              onAddPlumbingPipe={(p) => setPlumbingPipes((prev) => [...prev, p])}
              onSelectWall={setSelectedWallId}
              onSelectFurniture={setSelectedFurnitureId}
              onSelectDoorWindow={setSelectedDoorWindowId}
              onMoveFurniture={(id, x, y) => setFurniture((prev) => prev.map((f) => (f.id === id ? { ...f, x, y } : f)))}
              onMoveElectricalPoint={(id, x, y) => setElectricalPoints((prev) => prev.map((p) => (p.id === id ? { ...p, x, y } : p)))}
              onMovePlumbingPoint={(id, x, y) => setPlumbingPoints((prev) => prev.map((p) => (p.id === id ? { ...p, x, y } : p)))}
              onUpdateWall={handleUpdateWall}
              onDeleteWall={(id) => { setDoorsWindows((prev) => prev.filter((d) => d.wallId !== id)); setWalls((prev) => prev.filter((w) => w.id !== id)); }}
              onDeleteFurniture={(id) => setFurniture((prev) => prev.filter((f) => f.id !== id))}
              onDeleteDoorWindow={(id) => { setDoorsWindows((prev) => prev.filter((d) => d.id !== id)); setSelectedDoorWindowId(null); }}
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
          </>
        )}
        {viewMode === '3d' && (
          <>
            <View3D
              walls={walls}
              furniture={furniture}
              doorsWindows={doorsWindows}
              electricalPoints={electricalPoints}
              electricalWires={electricalWires}
              plumbingPoints={plumbingPoints}
              plumbingPipes={plumbingPipes}
              showElectrical={showElectrical3D}
              showPlumbing={showPlumbing3D}
            />
            <div className="visibility-panel">
              <h3>Visibilité</h3>
              <label className="toggle-row">
                <input type="checkbox" checked={showElectrical3D} onChange={(e) => setShowElectrical3D(e.target.checked)} />
                <span className="toggle-icon elec">⚡</span> Électricité
              </label>
              <label className="toggle-row">
                <input type="checkbox" checked={showPlumbing3D} onChange={(e) => setShowPlumbing3D(e.target.checked)} />
                <span className="toggle-icon plumb">💧</span> Plomberie
              </label>
              <div className="legend">
                <h4>Légende</h4>
                <div className="legend-item"><span className="legend-color" style={{ background: '#FFA000' }}></span> Câbles élec.</div>
                <div className="legend-item"><span className="legend-color" style={{ background: '#2196F3' }}></span> Eau froide</div>
                <div className="legend-item"><span className="legend-color" style={{ background: '#F44336' }}></span> Eau chaude</div>
                <div className="legend-item"><span className="legend-color" style={{ background: '#795548' }}></span> Évacuation</div>
              </div>
              <p className="hint">Clic gauche + glisser : rotation<br/>Molette : zoom<br/>Clic droit + glisser : pan</p>
            </div>
          </>
        )}
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
