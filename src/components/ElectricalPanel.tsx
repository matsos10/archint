import { electricalCatalog, wireGauges } from '../utils/electrical-catalog';
import type { ElectricalType, Tool } from '../types';

interface ElectricalPanelProps {
  visible: boolean;
  activeTool: Tool;
  selectedType: ElectricalType | null;
  selectedGauge: string;
  onSelectType: (type: ElectricalType) => void;
  onSelectGauge: (gauge: string) => void;
  onSetTool: (tool: Tool) => void;
}

export function ElectricalPanel({ visible, activeTool, selectedType, selectedGauge, onSelectType, onSelectGauge, onSetTool }: ElectricalPanelProps) {
  if (!visible) return null;

  const categories = [...new Set(electricalCatalog.map((e) => e.category))];

  return (
    <div className="side-panel electrical-panel">
      <h3>⚡ Électricité</h3>

      <div className="panel-tabs">
        <button
          className={`tab-btn ${activeTool === 'electrical-point' ? 'active' : ''}`}
          onClick={() => onSetTool('electrical-point')}
        >
          Points
        </button>
        <button
          className={`tab-btn ${activeTool === 'electrical-wire' ? 'active' : ''}`}
          onClick={() => onSetTool('electrical-wire')}
        >
          Câbles
        </button>
      </div>

      {activeTool === 'electrical-point' && (
        <>
          {categories.map((cat) => (
            <div key={cat} className="catalog-category">
              <h4>{cat}</h4>
              <div className="catalog-grid">
                {electricalCatalog
                  .filter((e) => e.category === cat)
                  .map((e) => (
                    <button
                      key={e.type}
                      className={`catalog-item ${selectedType === e.type ? 'active' : ''}`}
                      onClick={() => onSelectType(e.type)}
                    >
                      <span className="catalog-symbol">{e.symbol}</span>
                      <span>{e.label}</span>
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </>
      )}

      {activeTool === 'electrical-wire' && (
        <div className="catalog-category">
          <h4>Section du câble</h4>
          {wireGauges.map((g) => (
            <button
              key={g}
              className={`catalog-item full-width ${selectedGauge === g ? 'active' : ''}`}
              onClick={() => onSelectGauge(g)}
            >
              {g}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
