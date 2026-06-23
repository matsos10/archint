import type { Surface, ElectricalPoint, ElectricalWire, PlumbingPoint, PlumbingPipe, Wall, FurnitureItem, DoorWindow } from '../types';
import { getSurfaceMaterial, categoryLabel } from '../utils/surface-catalog';

const PX_M = 40;

interface ElementListPanelProps {
  surfaces: Surface[];
  electricalPoints: ElectricalPoint[];
  electricalWires: ElectricalWire[];
  plumbingPoints: PlumbingPoint[];
  plumbingPipes: PlumbingPipe[];
  walls: Wall[];
  furniture: FurnitureItem[];
  doorsWindows: DoorWindow[];
  selectedSurfaceId: string | null;
  selectedWireId: string | null;
  selectedPipeId: string | null;
  selectedWallId: string | null;
  selectedFurnitureId: string | null;
  onSelectSurface: (id: string) => void;
  onSelectWire: (id: string) => void;
  onSelectPipe: (id: string) => void;
  onSelectWall: (id: string) => void;
  onSelectFurniture: (id: string) => void;
  onDeleteSurface: (id: string) => void;
  onDeleteWire: (id: string) => void;
  onDeletePipe: (id: string) => void;
}

function lineLen(s: { x: number; y: number }, e: { x: number; y: number }) {
  return Math.sqrt((e.x - s.x) ** 2 + (e.y - s.y) ** 2) / PX_M;
}

export function ElementListPanel({
  surfaces, electricalPoints, electricalWires, plumbingPoints, plumbingPipes,
  walls, furniture, doorsWindows,
  selectedSurfaceId, selectedWireId, selectedPipeId, selectedWallId, selectedFurnitureId,
  onSelectSurface, onSelectWire, onSelectPipe, onSelectWall, onSelectFurniture,
  onDeleteSurface, onDeleteWire, onDeletePipe,
}: ElementListPanelProps) {

  const surfacesByCategory = new Map<string, Surface[]>();
  for (const s of surfaces) {
    const mat = getSurfaceMaterial(s.material);
    const cat = mat ? categoryLabel[mat.category] : 'Autre';
    if (!surfacesByCategory.has(cat)) surfacesByCategory.set(cat, []);
    surfacesByCategory.get(cat)!.push(s);
  }

  const totalElements = surfaces.length + electricalPoints.length + electricalWires.length
    + plumbingPoints.length + plumbingPipes.length + walls.length + furniture.length + doorsWindows.length;

  return (
    <div className="element-list-panel">
      <h3>Éléments ({totalElements})</h3>

      {/* Walls */}
      {walls.length > 0 && (
        <div className="el-section">
          <h4>▬ Murs ({walls.length})</h4>
          {walls.map((w) => {
            const len = lineLen(w.start, w.end);
            return (
              <div
                key={w.id}
                className={`el-row ${w.id === selectedWallId ? 'active' : ''}`}
                onClick={() => onSelectWall(w.id)}
              >
                <span className="el-color" style={{ background: '#333' }} />
                <span className="el-name">Mur</span>
                <span className="el-info">{len.toFixed(2)}m</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Surfaces by category */}
      {[...surfacesByCategory.entries()].map(([cat, items]) => (
        <div key={cat} className="el-section">
          <h4>🧱 {cat} ({items.length})</h4>
          {items.map((s) => {
            const mat = getSurfaceMaterial(s.material);
            const isLine = !!(s.start && s.end);
            let info: string;
            if (isLine) {
              const len = lineLen(s.start!, s.end!);
              info = `${len.toFixed(1)}m × ${(s.wallHeight || 2.5)}m`;
            } else {
              info = `${((s.width / PX_M) * (s.height / PX_M)).toFixed(2)} m²`;
            }
            return (
              <div
                key={s.id}
                className={`el-row ${s.id === selectedSurfaceId ? 'active' : ''}`}
                onClick={() => onSelectSurface(s.id)}
              >
                <span className="el-color" style={{ background: mat?.color || '#ccc' }} />
                <span className="el-name">{mat?.label || s.material}</span>
                <span className="el-info">{info}</span>
                <button className="el-del" onClick={(e) => { e.stopPropagation(); onDeleteSurface(s.id); }} title="Supprimer">✕</button>
              </div>
            );
          })}
        </div>
      ))}

      {/* Furniture */}
      {furniture.length > 0 && (
        <div className="el-section">
          <h4>🪑 Mobilier ({furniture.length})</h4>
          {furniture.map((f) => (
            <div
              key={f.id}
              className={`el-row ${f.id === selectedFurnitureId ? 'active' : ''}`}
              onClick={() => onSelectFurniture(f.id)}
            >
              <span className="el-color" style={{ background: '#DEB887' }} />
              <span className="el-name">{f.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Electrical */}
      {(electricalPoints.length > 0 || electricalWires.length > 0) && (
        <div className="el-section">
          <h4>⚡ Électricité ({electricalPoints.length + electricalWires.length})</h4>
          {electricalPoints.map((p) => (
            <div key={p.id} className="el-row">
              <span className="el-color" style={{ background: '#FFE082' }} />
              <span className="el-name">{p.label}</span>
              <span className="el-info">{p.circuit}</span>
            </div>
          ))}
          {electricalWires.map((w) => {
            const len = lineLen(w.start, w.end);
            return (
              <div
                key={w.id}
                className={`el-row ${w.id === selectedWireId ? 'active' : ''}`}
                onClick={() => onSelectWire(w.id)}
              >
                <span className="el-color" style={{ background: '#FFA000' }} />
                <span className="el-name">Câble {w.gauge}</span>
                <span className="el-info">{len.toFixed(1)}m</span>
                <button className="el-del" onClick={(e) => { e.stopPropagation(); onDeleteWire(w.id); }} title="Supprimer">✕</button>
              </div>
            );
          })}
        </div>
      )}

      {/* Plumbing */}
      {(plumbingPoints.length > 0 || plumbingPipes.length > 0) && (
        <div className="el-section">
          <h4>💧 Plomberie ({plumbingPoints.length + plumbingPipes.length})</h4>
          {plumbingPoints.map((p) => (
            <div key={p.id} className="el-row">
              <span className="el-color" style={{ background: p.network === 'hot' ? '#F44336' : p.network === 'drain' ? '#795548' : '#2196F3' }} />
              <span className="el-name">{p.label}</span>
            </div>
          ))}
          {plumbingPipes.map((p) => {
            const len = lineLen(p.start, p.end);
            const netLabel: Record<string, string> = { supply: 'EF', hot: 'EC', drain: 'Évac.' };
            return (
              <div
                key={p.id}
                className={`el-row ${p.id === selectedPipeId ? 'active' : ''}`}
                onClick={() => onSelectPipe(p.id)}
              >
                <span className="el-color" style={{ background: p.network === 'hot' ? '#F44336' : p.network === 'drain' ? '#795548' : '#2196F3' }} />
                <span className="el-name">Ø{p.diameter} {netLabel[p.network]}</span>
                <span className="el-info">{len.toFixed(1)}m</span>
                <button className="el-del" onClick={(e) => { e.stopPropagation(); onDeletePipe(p.id); }} title="Supprimer">✕</button>
              </div>
            );
          })}
        </div>
      )}

      {totalElements === 0 && (
        <p className="hint">Aucun élément placé sur le plan.</p>
      )}
    </div>
  );
}
