import type { Wall, FurnitureItem, ElectricalWire, PlumbingPipe } from '../types';

const PIXELS_PER_METER = 40;

const wireGauges = ['1.5 mm²', '2.5 mm²', '6 mm²', '10 mm²', '16 mm²'];
const pipeDiameters = [12, 16, 20, 25, 32, 40, 50, 75, 100];

interface PropertiesPanelProps {
  selectedWall: Wall | null;
  selectedFurniture: FurnitureItem | null;
  selectedWire: ElectricalWire | null;
  selectedPipe: PlumbingPipe | null;
  onUpdateWall: (wall: Wall) => void;
  onUpdateFurniture: (item: FurnitureItem) => void;
  onUpdateWire: (wire: ElectricalWire) => void;
  onUpdatePipe: (pipe: PlumbingPipe) => void;
  onDelete: () => void;
}

function lineLength(start: { x: number; y: number }, end: { x: number; y: number }) {
  return Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2) / PIXELS_PER_METER;
}

export function PropertiesPanel({ selectedWall, selectedFurniture, selectedWire, selectedPipe, onUpdateWall, onUpdateFurniture, onUpdateWire, onUpdatePipe, onDelete }: PropertiesPanelProps) {
  if (!selectedWall && !selectedFurniture && !selectedWire && !selectedPipe) {
    return (
      <div className="properties-panel">
        <h3>Propriétés</h3>
        <p className="hint">Sélectionnez un élément pour voir ses propriétés</p>
      </div>
    );
  }

  if (selectedWall) {
    const dx = selectedWall.end.x - selectedWall.start.x;
    const dy = selectedWall.end.y - selectedWall.start.y;
    const lengthPx = Math.sqrt(dx * dx + dy * dy);
    const lengthM = lengthPx / PIXELS_PER_METER;

    const handleLengthChange = (newM: number) => {
      if (newM <= 0) return;
      const ratio = (newM * PIXELS_PER_METER) / lengthPx;
      onUpdateWall({
        ...selectedWall,
        end: {
          x: selectedWall.start.x + dx * ratio,
          y: selectedWall.start.y + dy * ratio,
        },
      });
    };

    return (
      <div className="properties-panel">
        <h3>Mur</h3>
        <div className="prop-row">
          <label>Longueur</label>
          <input type="number" step="0.05" min="0.1" value={parseFloat(lengthM.toFixed(2))} onChange={(e) => handleLengthChange(Number(e.target.value))} />
          <span>m</span>
        </div>
        <div className="prop-row">
          <label></label>
          <span style={{ fontSize: 11, color: '#888' }}>{(lengthM * 100).toFixed(0)} cm</span>
        </div>
        <div className="prop-row">
          <label>Épaisseur</label>
          <input type="range" min="4" max="20" value={selectedWall.thickness} onChange={(e) => onUpdateWall({ ...selectedWall, thickness: Number(e.target.value) })} />
          <span>{selectedWall.thickness}px</span>
        </div>
        <button className="delete-btn" onClick={onDelete}>Supprimer</button>
      </div>
    );
  }

  if (selectedWire) {
    const lenM = lineLength(selectedWire.start, selectedWire.end);
    return (
      <div className="properties-panel">
        <h3>⚡ Câble électrique</h3>
        <div className="prop-row">
          <label>Longueur</label>
          <span style={{ fontWeight: 600 }}>{lenM.toFixed(2)} m</span>
        </div>
        <div className="prop-row">
          <label>Section</label>
          <select value={selectedWire.gauge} onChange={(e) => onUpdateWire({ ...selectedWire, gauge: e.target.value })}>
            {wireGauges.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div className="prop-row">
          <label>Circuit</label>
          <input type="text" value={selectedWire.circuit} onChange={(e) => onUpdateWire({ ...selectedWire, circuit: e.target.value })} style={{ flex: 1, padding: '4px', border: '1px solid #ddd', borderRadius: 4, fontSize: 12 }} />
        </div>
        <button className="delete-btn" onClick={onDelete}>Supprimer</button>
      </div>
    );
  }

  if (selectedPipe) {
    const lenM = lineLength(selectedPipe.start, selectedPipe.end);
    const networkLabels: Record<string, string> = { supply: 'Eau froide', hot: 'Eau chaude', drain: 'Évacuation' };
    return (
      <div className="properties-panel">
        <h3>💧 Tuyau</h3>
        <div className="prop-row">
          <label>Longueur</label>
          <span style={{ fontWeight: 600 }}>{lenM.toFixed(2)} m</span>
        </div>
        <div className="prop-row">
          <label>Diamètre</label>
          <select value={selectedPipe.diameter} onChange={(e) => onUpdatePipe({ ...selectedPipe, diameter: Number(e.target.value) })}>
            {pipeDiameters.map((d) => <option key={d} value={d}>Ø{d} mm</option>)}
          </select>
        </div>
        <div className="prop-row">
          <label>Réseau</label>
          <select value={selectedPipe.network} onChange={(e) => onUpdatePipe({ ...selectedPipe, network: e.target.value as 'supply' | 'hot' | 'drain' })}>
            {Object.entries(networkLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <button className="delete-btn" onClick={onDelete}>Supprimer</button>
      </div>
    );
  }

  if (selectedFurniture) {
    return (
      <div className="properties-panel">
        <h3>{selectedFurniture.label}</h3>
        <div className="prop-row">
          <label>Rotation</label>
          <input type="range" min="0" max="360" step="15" value={selectedFurniture.rotation} onChange={(e) => onUpdateFurniture({ ...selectedFurniture, rotation: Number(e.target.value) })} />
          <span>{selectedFurniture.rotation}°</span>
        </div>
        <div className="prop-row">
          <label>Largeur</label>
          <input type="number" value={selectedFurniture.width} min="10" onChange={(e) => onUpdateFurniture({ ...selectedFurniture, width: Number(e.target.value) })} />
        </div>
        <div className="prop-row">
          <label>Hauteur</label>
          <input type="number" value={selectedFurniture.height} min="10" onChange={(e) => onUpdateFurniture({ ...selectedFurniture, height: Number(e.target.value) })} />
        </div>
        <button className="delete-btn" onClick={onDelete}>Supprimer</button>
      </div>
    );
  }

  return null;
}
