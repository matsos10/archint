import { surfaceCatalog, surfaceCategories, getSurfaceMaterial } from '../utils/surface-catalog';
import type { Surface } from '../types';

const PIXELS_PER_METER = 40;

interface SurfacePanelProps {
  visible: boolean;
  selectedMaterial: string;
  selectedSurface: Surface | null;
  surfaces: Surface[];
  onSelectMaterial: (key: string) => void;
  onUpdateSurface: (s: Surface) => void;
  onDeleteSurface: (id: string) => void;
  onSelectSurface: (id: string) => void;
}

export function SurfacePanel({
  visible, selectedMaterial, selectedSurface, surfaces,
  onSelectMaterial, onUpdateSurface, onDeleteSurface, onSelectSurface,
}: SurfacePanelProps) {
  if (!visible) return null;

  if (selectedSurface) {
    const isLine = !!(selectedSurface.start && selectedSurface.end);

    if (isLine) {
      const dx = selectedSurface.end!.x - selectedSurface.start!.x;
      const dy = selectedSurface.end!.y - selectedSurface.start!.y;
      const lenM = Math.sqrt(dx * dx + dy * dy) / PIXELS_PER_METER;
      const wallH = selectedSurface.wallHeight || 2.5;
      const area = lenM * wallH;

      return (
        <div className="side-panel surface-panel">
          <h3>🧱 Cloison / Revêtement</h3>
          <div className="prop-row">
            <label>Matériau</label>
            <select
              value={selectedSurface.material}
              onChange={(e) => onUpdateSurface({ ...selectedSurface, material: e.target.value })}
            >
              {surfaceCategories.map((cat) => (
                <optgroup key={cat.id} label={cat.label}>
                  {surfaceCatalog.filter((m) => m.category === cat.id).map((m) => (
                    <option key={m.key} value={m.key}>{m.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="prop-row">
            <label>Longueur</label>
            <span style={{ fontWeight: 600 }}>{lenM.toFixed(2)} m</span>
          </div>
          <div className="prop-row">
            <label>Hauteur</label>
            <input
              type="number" step="0.1" min="0.5" max="5"
              value={wallH}
              onChange={(e) => onUpdateSurface({ ...selectedSurface, wallHeight: Math.max(0.5, Number(e.target.value)) })}
            />
            <span>m</span>
          </div>
          <div className="prop-row">
            <label>Surface</label>
            <span style={{ fontWeight: 600 }}>{area.toFixed(2)} m²</span>
          </div>
          <button className="delete-btn" onClick={() => onDeleteSurface(selectedSurface.id)}>Supprimer</button>
        </div>
      );
    }

    // Rect surface (floor/ceiling)
    const wM = selectedSurface.width / PIXELS_PER_METER;
    const hM = selectedSurface.height / PIXELS_PER_METER;
    const area = wM * hM;
    return (
      <div className="side-panel surface-panel">
        <h3>🧱 Surface</h3>
        <div className="prop-row">
          <label>Matériau</label>
          <select
            value={selectedSurface.material}
            onChange={(e) => onUpdateSurface({ ...selectedSurface, material: e.target.value })}
          >
            {surfaceCategories.map((cat) => (
              <optgroup key={cat.id} label={cat.label}>
                {surfaceCatalog.filter((m) => m.category === cat.id).map((m) => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="prop-row">
          <label>Largeur</label>
          <input
            type="number" step="0.05" min="0.1"
            value={parseFloat(wM.toFixed(2))}
            onChange={(e) => onUpdateSurface({ ...selectedSurface, width: Math.max(4, Number(e.target.value) * PIXELS_PER_METER) })}
          />
          <span>m</span>
        </div>
        <div className="prop-row">
          <label>Hauteur</label>
          <input
            type="number" step="0.05" min="0.1"
            value={parseFloat(hM.toFixed(2))}
            onChange={(e) => onUpdateSurface({ ...selectedSurface, height: Math.max(4, Number(e.target.value) * PIXELS_PER_METER) })}
          />
          <span>m</span>
        </div>
        <div className="prop-row">
          <label>Surface</label>
          <span style={{ fontWeight: 600 }}>{area.toFixed(2)} m²</span>
        </div>
        <button className="delete-btn" onClick={() => onDeleteSurface(selectedSurface.id)}>Supprimer</button>
      </div>
    );
  }

  // Catalog + element list
  return (
    <div className="side-panel surface-panel">
      <h3>🧱 Surfaces / Matériaux</h3>
      <p className="hint">Choisissez un matériau puis dessinez sur le plan. Sols/plafonds : rectangle. Murs : tracé comme un mur.</p>

      {surfaces.length > 0 && (
        <div className="element-list">
          <h4 style={{ fontSize: 11, textTransform: 'uppercase', color: '#888', margin: '10px 0 6px' }}>Éléments placés ({surfaces.length})</h4>
          <div className="dw-list">
            {surfaces.map((s) => {
              const mat = getSurfaceMaterial(s.material);
              const isLine = !!(s.start && s.end);
              let info: string;
              if (isLine) {
                const dx = s.end!.x - s.start!.x;
                const dy = s.end!.y - s.start!.y;
                const lenM = Math.sqrt(dx * dx + dy * dy) / PIXELS_PER_METER;
                info = `${lenM.toFixed(1)}m × ${(s.wallHeight || 2.5).toFixed(1)}m`;
              } else {
                const area = (s.width / PIXELS_PER_METER) * (s.height / PIXELS_PER_METER);
                info = `${area.toFixed(2)} m²`;
              }
              return (
                <button
                  key={s.id}
                  className={`dw-item ${selectedMaterial === s.material ? '' : ''}`}
                  onClick={() => onSelectSurface(s.id)}
                  style={{ justifyContent: 'space-between' }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ background: mat?.color || '#ccc', borderRadius: 3, width: 16, height: 16, display: 'inline-block' }}></span>
                    <span className="dw-label" style={{ fontSize: 10 }}>{mat?.label || s.material}</span>
                  </span>
                  <span style={{ fontSize: 9, color: '#888' }}>{info}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {surfaceCategories.map((cat) => (
        <div key={cat.id} className="catalog-category">
          <h4>{cat.icon} {cat.label} {cat.id === 'wall-covering' ? '(tracé linéaire)' : '(rectangle)'}</h4>
          <div className="dw-list">
            {surfaceCatalog.filter((m) => m.category === cat.id).map((m) => (
              <button
                key={m.key}
                className={`dw-item ${selectedMaterial === m.key ? 'active' : ''}`}
                onClick={() => onSelectMaterial(m.key)}
              >
                <span className="dw-icon" style={{ background: m.color, borderRadius: 4 }}>&nbsp;</span>
                <span className="dw-info">
                  <span className="dw-label">{m.label}</span>
                  <span className="dw-dims">{m.components.length} composants/m²</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
