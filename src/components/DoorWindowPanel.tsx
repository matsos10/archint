import { doorWindowCatalog, defaultColors } from '../utils/door-window-catalog';
import type { DoorWindowType, DoorWindow, Wall } from '../types';

interface DoorWindowPanelProps {
  visible: boolean;
  selectedType: DoorWindowType | null;
  selectedItem: DoorWindow | null;
  walls: Wall[];
  onSelectType: (type: DoorWindowType) => void;
  onUpdateItem: (item: DoorWindow) => void;
  onDeleteItem: (id: string) => void;
}

export function DoorWindowPanel({
  visible, selectedType, selectedItem, walls,
  onSelectType, onUpdateItem, onDeleteItem,
}: DoorWindowPanelProps) {
  if (!visible) return null;

  const categories = [...new Set(doorWindowCatalog.map((d) => d.category))];
  const selectedCatalog = selectedType ? doorWindowCatalog.find((d) => d.type === selectedType) : null;

  return (
    <div className="side-panel door-window-panel">
      <h3>Portes & Fenêtres</h3>

      {!selectedItem && (
        <>
          <p className="hint">Choisissez un type puis cliquez sur un mur pour placer l'élément.</p>
          {categories.map((cat) => (
            <div key={cat} className="catalog-category">
              <h4>{cat}</h4>
              <div className="dw-list">
                {doorWindowCatalog
                  .filter((d) => d.category === cat)
                  .map((d) => (
                    <button
                      key={d.type}
                      className={`dw-item ${selectedType === d.type ? 'active' : ''}`}
                      onClick={() => onSelectType(d.type)}
                    >
                      <div className="dw-icon">{d.type.startsWith('door') ? '🚪' : '🪟'}</div>
                      <div className="dw-info">
                        <span className="dw-label">{d.label}</span>
                        <span className="dw-dims">{d.width}×{d.height} cm</span>
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </>
      )}

      {selectedItem && (
        <div className="dw-properties">
          <h4>{selectedItem.label}</h4>

          <div className="prop-row">
            <label>Largeur (cm)</label>
            <input type="number" min="30" max="500" value={selectedItem.width}
              onChange={(e) => onUpdateItem({ ...selectedItem, width: Number(e.target.value) })} />
          </div>

          <div className="prop-row">
            <label>Hauteur (cm)</label>
            <input type="number" min="30" max="300" value={selectedItem.height}
              onChange={(e) => onUpdateItem({ ...selectedItem, height: Number(e.target.value) })} />
          </div>

          <div className="prop-row">
            <label>Position</label>
            <input type="range" min="0.05" max="0.95" step="0.01" value={selectedItem.position}
              onChange={(e) => onUpdateItem({ ...selectedItem, position: Number(e.target.value) })} />
          </div>

          <div className="prop-row">
            <label>Ouverture</label>
            <select value={selectedItem.openingDirection}
              onChange={(e) => onUpdateItem({ ...selectedItem, openingDirection: e.target.value as 'left' | 'right' })}>
              <option value="left">Gauche</option>
              <option value="right">Droite</option>
            </select>
          </div>

          <div className="prop-row">
            <label>Angle ouv.</label>
            <input type="range" min="0" max="180" step="5" value={selectedItem.openingAngle}
              onChange={(e) => onUpdateItem({ ...selectedItem, openingAngle: Number(e.target.value) })} />
            <span>{selectedItem.openingAngle}°</span>
          </div>

          {selectedCatalog && (
            <div className="prop-row">
              <label>Matériau</label>
              <select value={selectedItem.material}
                onChange={(e) => onUpdateItem({ ...selectedItem, material: e.target.value })}>
                {selectedCatalog.materials.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          )}

          <div className="prop-row">
            <label>Couleur</label>
            <div className="color-picker">
              {defaultColors.map((c) => (
                <button key={c}
                  className={`color-swatch ${selectedItem.color === c ? 'active' : ''}`}
                  style={{ backgroundColor: c }}
                  onClick={() => onUpdateItem({ ...selectedItem, color: c })}
                />
              ))}
            </div>
          </div>

          <div className="prop-row">
            <label>Sur mur</label>
            <select value={selectedItem.wallId}
              onChange={(e) => onUpdateItem({ ...selectedItem, wallId: e.target.value })}>
              {walls.map((w, i) => (
                <option key={w.id} value={w.id}>Mur {i + 1}</option>
              ))}
            </select>
          </div>

          <button className="delete-btn" onClick={() => onDeleteItem(selectedItem.id)}>
            Supprimer
          </button>
        </div>
      )}
    </div>
  );
}
