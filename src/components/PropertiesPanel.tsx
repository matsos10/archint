import type { Wall, FurnitureItem } from '../types';

interface PropertiesPanelProps {
  selectedWall: Wall | null;
  selectedFurniture: FurnitureItem | null;
  onUpdateWall: (wall: Wall) => void;
  onUpdateFurniture: (item: FurnitureItem) => void;
  onDelete: () => void;
}

export function PropertiesPanel({ selectedWall, selectedFurniture, onUpdateWall, onUpdateFurniture, onDelete }: PropertiesPanelProps) {
  if (!selectedWall && !selectedFurniture) {
    return (
      <div className="properties-panel">
        <h3>Propriétés</h3>
        <p className="hint">Sélectionnez un élément pour voir ses propriétés</p>
      </div>
    );
  }

  if (selectedWall) {
    const length = Math.sqrt(
      (selectedWall.end.x - selectedWall.start.x) ** 2 +
      (selectedWall.end.y - selectedWall.start.y) ** 2
    ) / 40;

    return (
      <div className="properties-panel">
        <h3>Mur</h3>
        <div className="prop-row">
          <label>Longueur</label>
          <span>{length.toFixed(2)} m</span>
        </div>
        <div className="prop-row">
          <label>Épaisseur</label>
          <input
            type="range"
            min="4"
            max="20"
            value={selectedWall.thickness}
            onChange={(e) => onUpdateWall({ ...selectedWall, thickness: Number(e.target.value) })}
          />
          <span>{selectedWall.thickness}px</span>
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
          <input
            type="range"
            min="0"
            max="360"
            step="15"
            value={selectedFurniture.rotation}
            onChange={(e) => onUpdateFurniture({ ...selectedFurniture, rotation: Number(e.target.value) })}
          />
          <span>{selectedFurniture.rotation}°</span>
        </div>
        <div className="prop-row">
          <label>Largeur</label>
          <input
            type="number"
            value={selectedFurniture.width}
            min="10"
            onChange={(e) => onUpdateFurniture({ ...selectedFurniture, width: Number(e.target.value) })}
          />
        </div>
        <div className="prop-row">
          <label>Hauteur</label>
          <input
            type="number"
            value={selectedFurniture.height}
            min="10"
            onChange={(e) => onUpdateFurniture({ ...selectedFurniture, height: Number(e.target.value) })}
          />
        </div>
        <button className="delete-btn" onClick={onDelete}>Supprimer</button>
      </div>
    );
  }

  return null;
}
