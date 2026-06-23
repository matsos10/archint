import type { MaterialItem } from '../types';

interface MaterialsPanelProps {
  materials: MaterialItem[];
  visible: boolean;
  onClose: () => void;
}

export function MaterialsPanel({ materials, visible, onClose }: MaterialsPanelProps) {
  if (!visible) return null;

  const elec = materials.filter((m) => m.category === 'electrical');
  const plumb = materials.filter((m) => m.category === 'plumbing');

  const exportCSV = () => {
    const lines = ['Catégorie;Article;Quantité;Unité'];
    for (const m of materials) {
      lines.push(`${m.category === 'electrical' ? 'Électricité' : 'Plomberie'};${m.name};${m.quantity};${m.unit}`);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'liste-materiaux.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="materials-overlay">
      <div className="materials-modal">
        <div className="materials-header">
          <h2>📋 Liste des Matériaux</h2>
          <div className="materials-actions">
            <button className="action-btn" onClick={exportCSV}>📤 Exporter CSV</button>
            <button className="action-btn" onClick={onClose}>✕ Fermer</button>
          </div>
        </div>

        {materials.length === 0 && (
          <p className="hint">Aucun élément électrique ou plomberie placé sur le plan.</p>
        )}

        {elec.length > 0 && (
          <div className="materials-section">
            <h3>⚡ Électricité</h3>
            <table className="materials-table">
              <thead>
                <tr><th>Article</th><th>Quantité</th><th>Unité</th></tr>
              </thead>
              <tbody>
                {elec.map((m, i) => (
                  <tr key={i}><td>{m.name}</td><td>{m.quantity}</td><td>{m.unit}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {plumb.length > 0 && (
          <div className="materials-section">
            <h3>💧 Plomberie</h3>
            <table className="materials-table">
              <thead>
                <tr><th>Article</th><th>Quantité</th><th>Unité</th></tr>
              </thead>
              <tbody>
                {plumb.map((m, i) => (
                  <tr key={i}><td>{m.name}</td><td>{m.quantity}</td><td>{m.unit}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
