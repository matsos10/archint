import { plumbingCatalog, pipeDiameters } from '../utils/plumbing-catalog';
import type { PlumbingType, Tool } from '../types';

interface PlumbingPanelProps {
  visible: boolean;
  activeTool: Tool;
  selectedType: PlumbingType | null;
  selectedDiameter: number;
  selectedNetwork: 'supply' | 'hot' | 'drain';
  onSelectType: (type: PlumbingType) => void;
  onSelectDiameter: (d: number) => void;
  onSelectNetwork: (n: 'supply' | 'hot' | 'drain') => void;
  onSetTool: (tool: Tool) => void;
}

export function PlumbingPanel({
  visible, activeTool, selectedType, selectedDiameter, selectedNetwork,
  onSelectType, onSelectDiameter, onSelectNetwork, onSetTool,
}: PlumbingPanelProps) {
  if (!visible) return null;

  const categories = [...new Set(plumbingCatalog.map((p) => p.category))];

  return (
    <div className="side-panel plumbing-panel">
      <h3>💧 Plomberie</h3>

      <div className="panel-tabs">
        <button
          className={`tab-btn ${activeTool === 'plumbing-point' ? 'active' : ''}`}
          onClick={() => onSetTool('plumbing-point')}
        >
          Points
        </button>
        <button
          className={`tab-btn ${activeTool === 'plumbing-pipe' ? 'active' : ''}`}
          onClick={() => onSetTool('plumbing-pipe')}
        >
          Tuyaux
        </button>
      </div>

      {activeTool === 'plumbing-point' && (
        <>
          {categories.map((cat) => (
            <div key={cat} className="catalog-category">
              <h4>{cat}</h4>
              <div className="catalog-grid">
                {plumbingCatalog
                  .filter((p) => p.category === cat)
                  .map((p) => (
                    <button
                      key={p.type}
                      className={`catalog-item ${selectedType === p.type ? 'active' : ''}`}
                      onClick={() => { onSelectType(p.type); onSelectNetwork(p.network); }}
                    >
                      <span className="catalog-symbol">{p.symbol}</span>
                      <span>{p.label}</span>
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </>
      )}

      {activeTool === 'plumbing-pipe' && (
        <div className="catalog-category">
          <h4>Réseau</h4>
          <div className="catalog-grid">
            {(['supply', 'hot', 'drain'] as const).map((n) => (
              <button
                key={n}
                className={`catalog-item ${selectedNetwork === n ? 'active' : ''}`}
                onClick={() => onSelectNetwork(n)}
              >
                <span className="catalog-symbol">
                  {n === 'supply' ? '💧' : n === 'hot' ? '♨' : '▽'}
                </span>
                <span>{n === 'supply' ? 'Froide' : n === 'hot' ? 'Chaude' : 'Évacuation'}</span>
              </button>
            ))}
          </div>
          <h4>Diamètre</h4>
          {pipeDiameters.map((d) => (
            <button
              key={d}
              className={`catalog-item full-width ${selectedDiameter === d ? 'active' : ''}`}
              onClick={() => onSelectDiameter(d)}
            >
              Ø{d} mm
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
