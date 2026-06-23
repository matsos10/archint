import { surfaceCatalog, surfaceCategories } from '../utils/surface-catalog';
import type { Surface } from '../types';

interface SurfacePanelProps {
  visible: boolean;
  selectedMaterial: string;
  selectedSurface: Surface | null;
  onSelectMaterial: (key: string) => void;
  onUpdateSurface: (s: Surface) => void;
  onDeleteSurface: (id: string) => void;
}

export function SurfacePanel({
  visible, selectedMaterial, selectedSurface,
  onSelectMaterial, onUpdateSurface, onDeleteSurface,
}: SurfacePanelProps) {
  if (!visible) return null;

  if (selectedSurface) {
    const wM = selectedSurface.width / 40;
    const hM = selectedSurface.height / 40;
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
            onChange={(e) => onUpdateSurface({ ...selectedSurface, width: Math.max(4, Number(e.target.value) * 40) })}
          />
          <span>m</span>
        </div>
        <div className="prop-row">
          <label>Hauteur</label>
          <input
            type="number" step="0.05" min="0.1"
            value={parseFloat(hM.toFixed(2))}
            onChange={(e) => onUpdateSurface({ ...selectedSurface, height: Math.max(4, Number(e.target.value) * 40) })}
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

  return (
    <div className="side-panel surface-panel">
      <h3>🧱 Surfaces / Matériaux</h3>
      <p className="hint">Choisissez un matériau puis dessinez un rectangle sur le plan (sol, mur, plafond).</p>
      {surfaceCategories.map((cat) => (
        <div key={cat.id} className="catalog-category">
          <h4>{cat.icon} {cat.label}</h4>
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
