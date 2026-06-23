import type { Wall, ElectricalPoint, ElectricalWire, PlumbingPoint, PlumbingPipe, MaterialItem } from '../types';

const PIXELS_PER_METER = 40;
const WALL_HEIGHT_M = 2.5;
const PLASTERBOARD_W = 1.2;
const PLASTERBOARD_H = 2.5;
const PLASTERBOARD_AREA = PLASTERBOARD_W * PLASTERBOARD_H;

function segmentLength(seg: { start: { x: number; y: number }; end: { x: number; y: number } }): number {
  const dx = seg.end.x - seg.start.x;
  const dy = seg.end.y - seg.start.y;
  return Math.sqrt(dx * dx + dy * dy) / PIXELS_PER_METER;
}

export function calculateMaterials(
  walls: Wall[],
  electricalPoints: ElectricalPoint[],
  electricalWires: ElectricalWire[],
  plumbingPoints: PlumbingPoint[],
  plumbingPipes: PlumbingPipe[],
): MaterialItem[] {
  const items: MaterialItem[] = [];

  // --- Construction (plaques de plâtre, LSF, isolation) ---
  if (walls.length > 0) {
    const totalWallLength = walls.reduce((sum, w) => sum + segmentLength(w), 0);
    const totalWallArea = totalWallLength * WALL_HEIGHT_M;

    const plasterboardCount = Math.ceil((totalWallArea * 2) / PLASTERBOARD_AREA * 1.1);
    items.push({ name: 'Plaque de plâtre BA13 (1200×2500)', quantity: plasterboardCount, unit: 'pcs', category: 'construction' });

    const railLength = totalWallLength * 2;
    items.push({ name: 'Rail R48 (3m)', quantity: Math.ceil(railLength / 3 * 1.1), unit: 'pcs', category: 'construction' });

    const montantSpacing = 0.6;
    const montantCount = walls.reduce((sum, w) => {
      const len = segmentLength(w);
      return sum + Math.ceil(len / montantSpacing) + 1;
    }, 0);
    items.push({ name: 'Montant M48 (2.5m)', quantity: Math.ceil(montantCount * 1.1), unit: 'pcs', category: 'construction' });

    const insulationPanels = Math.ceil(totalWallArea / (1.2 * 0.6) * 1.1);
    items.push({ name: 'Panneau isolant laine minérale 45mm (1200×600)', quantity: insulationPanels, unit: 'pcs', category: 'construction' });

    const screwsPerBoard = 28;
    items.push({ name: 'Vis plaque TTPC 25mm', quantity: plasterboardCount * screwsPerBoard, unit: 'pcs', category: 'construction' });

    items.push({ name: 'Bande à joint (rouleau 23m)', quantity: Math.ceil(totalWallLength * 2 / 23 * 1.1), unit: 'pcs', category: 'construction' });

    items.push({ name: 'Enduit à joint (sac 25kg)', quantity: Math.ceil(totalWallArea * 2 * 0.3 / 25), unit: 'pcs', category: 'construction' });

    // --- Faux plafond (plaques de plâtre + LSF) ---
    const allPoints = walls.flatMap((w) => [w.start, w.end]);
    const minX = Math.min(...allPoints.map((p) => p.x)) / PIXELS_PER_METER;
    const maxX = Math.max(...allPoints.map((p) => p.x)) / PIXELS_PER_METER;
    const minY = Math.min(...allPoints.map((p) => p.y)) / PIXELS_PER_METER;
    const maxY = Math.max(...allPoints.map((p) => p.y)) / PIXELS_PER_METER;
    const ceilingArea = (maxX - minX) * (maxY - minY);

    if (ceilingArea > 0.5) {
      const ceilingBoardArea = 1.2 * 2.5;
      const ceilingBoards = Math.ceil(ceilingArea / ceilingBoardArea * 1.1);
      items.push({ name: '[Plafond] Plaque de plâtre BA13 (1200×2500)', quantity: ceilingBoards, unit: 'pcs', category: 'construction' });

      const primarySpacing = 1.2;
      const secondarySpacing = 0.5;
      const ceilingW = maxX - minX;
      const ceilingL = maxY - minY;

      const primaryCount = Math.ceil(ceilingL / primarySpacing) + 1;
      const primaryRails = Math.ceil(primaryCount * ceilingW / 3 * 1.1);
      items.push({ name: '[Plafond] Fourrure F530 primaire (3m)', quantity: primaryRails, unit: 'pcs', category: 'construction' });

      const secondaryCount = Math.ceil(ceilingW / secondarySpacing) + 1;
      const secondaryRails = Math.ceil(secondaryCount * ceilingL / 3 * 1.1);
      items.push({ name: '[Plafond] Fourrure F530 secondaire (3m)', quantity: secondaryRails, unit: 'pcs', category: 'construction' });

      const suspenteSpacing = 1.2;
      const suspenteCount = Math.ceil(ceilingArea / (suspenteSpacing * suspenteSpacing) * 1.1);
      items.push({ name: '[Plafond] Suspente (tige + clip)', quantity: suspenteCount, unit: 'pcs', category: 'construction' });

      const eclisseCount = primaryRails + secondaryRails;
      items.push({ name: '[Plafond] Éclisse de raccord', quantity: Math.ceil(eclisseCount * 0.3), unit: 'pcs', category: 'construction' });

      items.push({ name: '[Plafond] Vis TTPC 25mm', quantity: ceilingBoards * 28, unit: 'pcs', category: 'construction' });

      const ceilingPerimeter = (ceilingW + ceilingL) * 2;
      items.push({ name: '[Plafond] Cornière périphérique (3m)', quantity: Math.ceil(ceilingPerimeter / 3 * 1.1), unit: 'pcs', category: 'construction' });

      items.push({ name: '[Plafond] Panneau isolant laine minérale (1200×600)', quantity: Math.ceil(ceilingArea / (1.2 * 0.6) * 1.1), unit: 'pcs', category: 'construction' });
    }
  }

  const outletCount = electricalPoints.filter((p) => p.type === 'outlet').length;
  if (outletCount > 0) items.push({ name: 'Prise 2P+T', quantity: outletCount, unit: 'pcs', category: 'electrical' });

  const switchCount = electricalPoints.filter((p) => p.type === 'switch').length;
  if (switchCount > 0) items.push({ name: 'Interrupteur', quantity: switchCount, unit: 'pcs', category: 'electrical' });

  const ceilingCount = electricalPoints.filter((p) => p.type === 'light-ceiling').length;
  if (ceilingCount > 0) items.push({ name: 'Douille DCL plafonnier', quantity: ceilingCount, unit: 'pcs', category: 'electrical' });

  const wallLightCount = electricalPoints.filter((p) => p.type === 'light-wall').length;
  if (wallLightCount > 0) items.push({ name: 'Applique murale (point)', quantity: wallLightCount, unit: 'pcs', category: 'electrical' });

  const panelCount = electricalPoints.filter((p) => p.type === 'panel').length;
  if (panelCount > 0) items.push({ name: 'Tableau électrique', quantity: panelCount, unit: 'pcs', category: 'electrical' });

  const thermoCount = electricalPoints.filter((p) => p.type === 'thermostat').length;
  if (thermoCount > 0) items.push({ name: 'Thermostat', quantity: thermoCount, unit: 'pcs', category: 'electrical' });

  const smokeCount = electricalPoints.filter((p) => p.type === 'smoke-detector').length;
  if (smokeCount > 0) items.push({ name: 'Détecteur de fumée', quantity: smokeCount, unit: 'pcs', category: 'electrical' });

  const wireByGauge: Record<string, number> = {};
  for (const wire of electricalWires) {
    const len = segmentLength(wire);
    wireByGauge[wire.gauge] = (wireByGauge[wire.gauge] || 0) + len;
  }
  for (const [gauge, length] of Object.entries(wireByGauge)) {
    items.push({ name: `Câble ${gauge}`, quantity: Math.ceil(length * 1.1), unit: 'm', category: 'electrical' });
  }

  if (electricalWires.length > 0) {
    const gaines = electricalWires.reduce((sum, w) => sum + segmentLength(w), 0);
    items.push({ name: 'Gaine ICTA Ø20', quantity: Math.ceil(gaines * 1.1), unit: 'm', category: 'electrical' });
  }

  const totalElecPoints = electricalPoints.length;
  if (totalElecPoints > 0) {
    items.push({ name: 'Boîte encastrement Ø67', quantity: totalElecPoints, unit: 'pcs', category: 'electrical' });
  }

  const circuits = new Set(electricalWires.map((w) => w.circuit).filter(Boolean));
  if (circuits.size > 0) {
    items.push({ name: 'Disjoncteur divisionnaire', quantity: circuits.size, unit: 'pcs', category: 'electrical' });
    items.push({ name: 'Disjoncteur différentiel 30mA', quantity: Math.ceil(circuits.size / 8), unit: 'pcs', category: 'electrical' });
  }

  const supplyPts = plumbingPoints.filter((p) => p.network === 'supply').length;
  if (supplyPts > 0) items.push({ name: 'Arrivée eau froide (raccord)', quantity: supplyPts, unit: 'pcs', category: 'plumbing' });

  const hotPts = plumbingPoints.filter((p) => p.network === 'hot').length;
  if (hotPts > 0) items.push({ name: 'Arrivée eau chaude (raccord)', quantity: hotPts, unit: 'pcs', category: 'plumbing' });

  const drainPts = plumbingPoints.filter((p) => p.network === 'drain').length;
  if (drainPts > 0) items.push({ name: 'Évacuation (raccord)', quantity: drainPts, unit: 'pcs', category: 'plumbing' });

  const heaterCount = plumbingPoints.filter((p) => p.type === 'water-heater').length;
  if (heaterCount > 0) items.push({ name: 'Chauffe-eau (ballon)', quantity: heaterCount, unit: 'pcs', category: 'plumbing' });

  const meterCount = plumbingPoints.filter((p) => p.type === 'water-meter').length;
  if (meterCount > 0) items.push({ name: 'Compteur d\'eau', quantity: meterCount, unit: 'pcs', category: 'plumbing' });

  const valveCount = plumbingPoints.filter((p) => p.type === 'supply-valve' || p.type === 'drain-valve').length;
  if (valveCount > 0) items.push({ name: 'Vanne / Siphon', quantity: valveCount, unit: 'pcs', category: 'plumbing' });

  const pipeByDiameter: Record<string, number> = {};
  for (const pipe of plumbingPipes) {
    const key = `${pipe.diameter}mm-${pipe.network}`;
    pipeByDiameter[key] = (pipeByDiameter[key] || 0) + segmentLength(pipe);
  }

  const networkLabels = { supply: 'eau froide', hot: 'eau chaude', drain: 'évacuation' };
  for (const [key, length] of Object.entries(pipeByDiameter)) {
    const [diam, network] = key.split('-');
    const material = network === 'drain' ? 'PVC' : 'PER';
    items.push({
      name: `Tube ${material} Ø${diam} (${networkLabels[network as keyof typeof networkLabels]})`,
      quantity: Math.ceil(length * 1.1),
      unit: 'm',
      category: 'plumbing',
    });
  }

  const connections = plumbingPipes.length * 2;
  if (connections > 0) {
    items.push({ name: 'Raccords / coudes / tés', quantity: Math.ceil(connections * 0.5), unit: 'pcs', category: 'plumbing' });
    items.push({ name: 'Colliers de fixation', quantity: Math.ceil(plumbingPipes.reduce((s, p) => s + segmentLength(p), 0) / 0.5), unit: 'pcs', category: 'plumbing' });
  }

  return items;
}
