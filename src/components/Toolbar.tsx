import type { Tool } from '../types';

interface ToolbarProps {
  activeTool: Tool;
  onToolChange: (tool: Tool) => void;
  onSave: () => void;
  onLoad: () => void;
  onExport: () => void;
  onClear: () => void;
}

const tools: { id: Tool; label: string; icon: string }[] = [
  { id: 'select', label: 'Sélection', icon: '↖' },
  { id: 'wall', label: 'Mur', icon: '▬' },
  { id: 'furniture', label: 'Mobilier', icon: '🪑' },
  { id: 'eraser', label: 'Gomme', icon: '✕' },
  { id: 'measure', label: 'Mesure', icon: '📏' },
];

export function Toolbar({ activeTool, onToolChange, onSave, onLoad, onExport, onClear }: ToolbarProps) {
  return (
    <div className="toolbar">
      <div className="toolbar-section">
        <span className="toolbar-title">Outils</span>
        {tools.map((t) => (
          <button
            key={t.id}
            className={`tool-btn ${activeTool === t.id ? 'active' : ''}`}
            onClick={() => onToolChange(t.id)}
            title={t.label}
          >
            <span className="tool-icon">{t.icon}</span>
            <span className="tool-label">{t.label}</span>
          </button>
        ))}
      </div>
      <div className="toolbar-section">
        <span className="toolbar-title">Projet</span>
        <button className="action-btn" onClick={onSave}>💾 Sauvegarder</button>
        <button className="action-btn" onClick={onLoad}>📂 Charger</button>
        <button className="action-btn" onClick={onExport}>📤 Exporter PNG</button>
        <button className="action-btn danger" onClick={onClear}>🗑 Nouveau</button>
      </div>
    </div>
  );
}
