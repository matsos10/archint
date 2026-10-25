import type { MaterialItem } from '../types';

interface MaterialsPanelProps {
  materials: MaterialItem[];
  visible: boolean;
  onClose: () => void;
}

const SECTION_META: Record<string, { title: string; order: number }> = {
  'Sols': { title: '▦ Sols', order: 1 },
  'Murs': { title: '▥ Murs', order: 2 },
  'Plafond': { title: '☁ Plafond', order: 3 },
  electrical: { title: '⚡ Électricité', order: 4 },
  plumbing: { title: '💧 Plomberie', order: 5 },
};

export function MaterialsPanel({ materials, visible, onClose }: MaterialsPanelProps) {
  if (!visible) return null;

  // Group by category, preserving a sensible section order.
  const groups = new Map<string, MaterialItem[]>();
  for (const m of materials) {
    if (!groups.has(m.category)) groups.set(m.category, []);
    groups.get(m.category)!.push(m);
  }
  const sections = [...groups.entries()].sort(
    (a, b) => (SECTION_META[a[0]]?.order ?? 99) - (SECTION_META[b[0]]?.order ?? 99),
  );

  const sectionTitle = (cat: string) => SECTION_META[cat]?.title || cat;

  const exportCSV = () => {
    const lines = ['Catégorie;Article;Quantité;Unité'];
    for (const m of materials) {
      lines.push(`${m.category};${m.name};${m.quantity};${m.unit}`);
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
          <p className="hint">
            Aucun matériau. Dessinez des surfaces (sols/murs/plafond) ou placez des éléments électriques/plomberie.
          </p>
        )}

        {sections.map(([cat, items]) => (
          <div key={cat} className="materials-section">
            <h3>{sectionTitle(cat)}</h3>
            <table className="materials-table">
              <thead>
                <tr><th>Article</th><th>Quantité</th><th>Unité</th></tr>
              </thead>
              <tbody>
                {items.map((m, i) => (
                  <tr key={i}><td>{m.name}</td><td>{m.quantity}</td><td>{m.unit}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
