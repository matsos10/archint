import type { Tool } from '../types';

interface ToolbarProps {
  activeTool: Tool;
  onToolChange: (tool: Tool) => void;
  onSave: () => void;
  onLoad: () => void;
  onExport: () => void;
  onClear: () => void;
  onShowMaterials: () => void;
}

const generalTools: { id: Tool; label: string; icon: string }[] = [
  { id: 'select', label: 'Sélection', icon: '↖' },
  { id: 'wall', label: 'Mur', icon: '▬' },
  { id: 'door-window', label: 'Portes/Fen.', icon: '🚪' },
  { id: 'furniture', label: 'Mobilier', icon: '🪑' },
  { id: 'eraser', label: 'Gomme', icon: '✕' },
  { id: 'measure', label: 'Mesure', icon: '📏' },
];

const elecTools: { id: Tool; label: string; icon: string }[] = [
  { id: 'electrical-point', label: 'Pt. élec.', icon: '⚡' },
  { id: 'electrical-wire', label: 'Câble', icon: '〰' },
];

const plumbTools: { id: Tool; label: string; icon: string }[] = [
  { id: 'plumbing-point', label: 'Pt. eau', icon: '💧' },
  { id: 'plumbing-pipe', label: 'Tuyau', icon: '│' },
];

function ToolGroup({ title, tools, activeTool, onToolChange }: { title: string; tools: typeof generalTools; activeTool: Tool; onToolChange: (t: Tool) => void }) {
  return (
    <div className="toolbar-section">
      <span className="toolbar-title">{title}</span>
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
  );
}

export function Toolbar({ activeTool, onToolChange, onSave, onLoad, onExport, onClear, onShowMaterials }: ToolbarProps) {
  return (
    <div className="toolbar">
      <ToolGroup title="Outils" tools={generalTools} activeTool={activeTool} onToolChange={onToolChange} />
      <ToolGroup title="Électricité" tools={elecTools} activeTool={activeTool} onToolChange={onToolChange} />
      <ToolGroup title="Plomberie" tools={plumbTools} activeTool={activeTool} onToolChange={onToolChange} />
      <div className="toolbar-section">
        <span className="toolbar-title">Projet</span>
        <button className="action-btn highlight" onClick={onShowMaterials}>📋 Matériaux</button>
        <button className="action-btn" onClick={onSave}>💾 Sauver</button>
        <button className="action-btn" onClick={onLoad}>📂 Charger</button>
        <button className="action-btn" onClick={onExport}>📤 PNG</button>
        <button className="action-btn danger" onClick={onClear}>🗑 Nouveau</button>
      </div>
    </div>
  );
}
