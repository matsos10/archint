import { furnitureCatalog } from '../utils/furniture-catalog';
import { furnitureIcons } from '../utils/furniture-icons';
import type { FurnitureType } from '../types';

interface FurniturePanelProps {
  visible: boolean;
  onSelect: (type: FurnitureType) => void;
  selectedFurnitureType: FurnitureType | null;
}

export function FurniturePanel({ visible, onSelect, selectedFurnitureType }: FurniturePanelProps) {
  if (!visible) return null;

  const categories = [...new Set(furnitureCatalog.map((f) => f.category))];

  return (
    <div className="furniture-panel">
      <h3>Mobilier</h3>
      {categories.map((cat) => (
        <div key={cat} className="furniture-category">
          <h4>{cat}</h4>
          <div className="furniture-grid">
            {furnitureCatalog
              .filter((f) => f.category === cat)
              .map((f) => (
                <button
                  key={f.type}
                  className={`furniture-item ${selectedFurnitureType === f.type ? 'active' : ''}`}
                  onClick={() => onSelect(f.type)}
                >
                  {furnitureIcons[f.type] ? (
                    <div
                      className="furniture-icon"
                      dangerouslySetInnerHTML={{ __html: furnitureIcons[f.type] }}
                    />
                  ) : (
                    <div className="furniture-preview" style={{
                      width: Math.min(f.width, 40),
                      height: Math.min(f.height, 40),
                      backgroundColor: selectedFurnitureType === f.type ? '#90CAF9' : '#ddd',
                    }} />
                  )}
                  <span>{f.label}</span>
                </button>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
