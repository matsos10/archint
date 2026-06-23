import { Canvas as R3FCanvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import type { Wall, FurnitureItem, ElectricalPoint, ElectricalWire, PlumbingPoint, PlumbingPipe, DoorWindow } from '../types';

const PX_PER_M = 40;
const WALL_HEIGHT = 2.5;

function toM(px: number) { return px / PX_PER_M; }

function Wall3D({ wall }: { wall: Wall }) {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);
  const mx = (wall.start.x + wall.end.x) / 2;
  const my = (wall.start.y + wall.end.y) / 2;
  const thick = Math.max(wall.thickness, 6);

  return (
    <mesh
      position={[toM(mx), WALL_HEIGHT / 2, toM(my)]}
      rotation={[0, -angle, 0]}
    >
      <boxGeometry args={[toM(length), WALL_HEIGHT, toM(thick)]} />
      <meshStandardMaterial color="#e0e0e0" />
    </mesh>
  );
}

const FURNITURE_COLORS: Record<string, string> = {
  'sofa': '#8B4513', 'bed-single': '#6495ED', 'bed-double': '#4169E1',
  'table': '#DEB887', 'chair': '#D2691E', 'desk': '#CD853F',
  'wardrobe': '#A0522D', 'bathtub': '#87CEEB', 'shower': '#ADD8E6',
  'toilet': '#F5F5DC', 'sink': '#B0C4DE', 'kitchen-counter': '#808080',
  'stove': '#696969', 'fridge': '#C0C0C0', 'door': '#228B22', 'window': '#00CED1',
};

const FURNITURE_HEIGHTS: Record<string, number> = {
  'sofa': 0.8, 'bed-single': 0.5, 'bed-double': 0.5, 'table': 0.75,
  'chair': 0.9, 'desk': 0.75, 'wardrobe': 2.0, 'bathtub': 0.6,
  'shower': 2.0, 'toilet': 0.4, 'sink': 0.85, 'kitchen-counter': 0.9,
  'stove': 0.9, 'fridge': 1.8, 'door': 2.1, 'window': 1.2,
};

function Furniture3D({ item }: { item: FurnitureItem }) {
  const h = FURNITURE_HEIGHTS[item.type] || 0.8;
  const cx = item.x + item.width / 2;
  const cy = item.y + item.height / 2;
  const color = FURNITURE_COLORS[item.type] || '#999';

  return (
    <mesh
      position={[toM(cx), h / 2, toM(cy)]}
      rotation={[0, -(item.rotation * Math.PI) / 180, 0]}
    >
      <boxGeometry args={[toM(item.width), h, toM(item.height)]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

const ELEC_COLOR = '#FFA000';

function ElecPoint3D({ pt }: { pt: ElectricalPoint }) {
  const y = pt.type === 'light-ceiling' ? WALL_HEIGHT - 0.05 : pt.type === 'light-wall' ? 1.8 : 0.3;
  return (
    <mesh position={[toM(pt.x), y, toM(pt.y)]}>
      <sphereGeometry args={[0.06, 12, 12]} />
      <meshStandardMaterial color={ELEC_COLOR} emissive={ELEC_COLOR} emissiveIntensity={0.5} />
    </mesh>
  );
}

function ElecWire3D({ wire }: { wire: ElectricalWire }) {
  const points = useMemo(() => {
    const h = 2.3;
    return new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(toM(wire.start.x), h, toM(wire.start.y)),
      new THREE.Vector3(toM(wire.end.x), h, toM(wire.end.y)),
    ]);
  }, [wire]);

  // @ts-expect-error r3f line element
  return (<line geometry={points}><lineBasicMaterial color={ELEC_COLOR} linewidth={2} /></line>);
}

const PIPE_COLORS = { supply: '#2196F3', hot: '#F44336', drain: '#795548' };
const PIPE_HEIGHTS = { supply: 0.15, hot: 0.20, drain: 0.05 };

function PlumbPoint3D({ pt }: { pt: PlumbingPoint }) {
  const color = PIPE_COLORS[pt.network];
  const y = PIPE_HEIGHTS[pt.network];
  return (
    <mesh position={[toM(pt.x), y, toM(pt.y)]}>
      <sphereGeometry args={[0.06, 12, 12]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

function PlumbPipe3D({ pipe }: { pipe: PlumbingPipe }) {
  const { geom, len, mx, mz, angle } = useMemo(() => {
    const dx = pipe.end.x - pipe.start.x;
    const dy = pipe.end.y - pipe.start.y;
    const l = Math.sqrt(dx * dx + dy * dy);
    return {
      geom: null,
      len: toM(l),
      mx: toM((pipe.start.x + pipe.end.x) / 2),
      mz: toM((pipe.start.y + pipe.end.y) / 2),
      angle: Math.atan2(dy, dx),
    };
  }, [pipe]);
  void geom;

  const radius = toM(pipe.diameter) / 2 / 10;
  const color = PIPE_COLORS[pipe.network];
  const y = PIPE_HEIGHTS[pipe.network];

  return (
    <mesh position={[mx, y, mz]} rotation={[0, -angle, Math.PI / 2]}>
      <cylinderGeometry args={[radius, radius, len, 8]} />
      <meshStandardMaterial color={color} transparent opacity={0.8} />
    </mesh>
  );
}

function DoorWindow3D({ dw, wall }: { dw: DoorWindow; wall: Wall }) {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const wallAngle = Math.atan2(dy, dx);
  const px = wall.start.x + dx * dw.position;
  const py = wall.start.y + dy * dw.position;
  const isDoor = dw.type.startsWith('door');
  const dwWidth = toM(dw.width * 40 / 100);
  const dwHeight = toM(dw.height * 40 / 100);
  const yPos = isDoor ? dwHeight / 2 : 1.0 + dwHeight / 2;

  return (
    <mesh position={[toM(px), yPos, toM(py)]} rotation={[0, -wallAngle, 0]}>
      <boxGeometry args={[dwWidth, dwHeight, 0.08]} />
      <meshStandardMaterial
        color={isDoor ? '#8B5E3C' : '#87CEEB'}
        transparent
        opacity={isDoor ? 0.9 : 0.4}
      />
    </mesh>
  );
}

function Floor({ walls }: { walls: Wall[] }) {
  const size = useMemo(() => {
    if (walls.length === 0) return { cx: 5, cz: 5, sx: 12, sz: 12 };
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const w of walls) {
      minX = Math.min(minX, w.start.x, w.end.x);
      maxX = Math.max(maxX, w.start.x, w.end.x);
      minY = Math.min(minY, w.start.y, w.end.y);
      maxY = Math.max(maxY, w.start.y, w.end.y);
    }
    const pad = 80;
    return {
      cx: toM((minX + maxX) / 2),
      cz: toM((minY + maxY) / 2),
      sx: toM(maxX - minX + pad * 2),
      sz: toM(maxY - minY + pad * 2),
    };
  }, [walls]);

  return (
    <mesh position={[size.cx, -0.01, size.cz]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[size.sx, size.sz]} />
      <meshStandardMaterial color="#f0ebe3" side={THREE.DoubleSide} />
    </mesh>
  );
}

interface View3DProps {
  walls: Wall[];
  furniture: FurnitureItem[];
  doorsWindows: DoorWindow[];
  electricalPoints: ElectricalPoint[];
  electricalWires: ElectricalWire[];
  plumbingPoints: PlumbingPoint[];
  plumbingPipes: PlumbingPipe[];
  showElectrical: boolean;
  showPlumbing: boolean;
}

export function View3D({
  walls, furniture, doorsWindows, electricalPoints, electricalWires,
  plumbingPoints, plumbingPipes, showElectrical, showPlumbing,
}: View3DProps) {
  const center = useMemo(() => {
    if (walls.length === 0) return [5, 0, 5] as [number, number, number];
    let sx = 0, sy = 0, n = 0;
    for (const w of walls) {
      sx += w.start.x + w.end.x;
      sy += w.start.y + w.end.y;
      n += 2;
    }
    return [toM(sx / n), 0, toM(sy / n)] as [number, number, number];
  }, [walls]);

  return (
    <div className="canvas-container">
      <R3FCanvas shadows>
        <PerspectiveCamera makeDefault position={[center[0] + 8, 10, center[2] + 8]} />
        <OrbitControls target={center} enableDamping dampingFactor={0.1} />

        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 15, 10]} intensity={1} castShadow />
        <directionalLight position={[-5, 8, -5]} intensity={0.3} />

        <Floor walls={walls} />

        {walls.map((w) => <Wall3D key={w.id} wall={w} />)}
        {doorsWindows.map((dw) => {
          const wall = walls.find((w) => w.id === dw.wallId);
          return wall ? <DoorWindow3D key={dw.id} dw={dw} wall={wall} /> : null;
        })}
        {furniture.map((f) => <Furniture3D key={f.id} item={f} />)}

        {showElectrical && (
          <>
            {electricalPoints.map((pt) => <ElecPoint3D key={pt.id} pt={pt} />)}
            {electricalWires.map((w) => <ElecWire3D key={w.id} wire={w} />)}
          </>
        )}

        {showPlumbing && (
          <>
            {plumbingPoints.map((pt) => <PlumbPoint3D key={pt.id} pt={pt} />)}
            {plumbingPipes.map((p) => <PlumbPipe3D key={p.id} pipe={p} />)}
          </>
        )}

        <gridHelper args={[30, 30, '#ccc', '#eee']} position={[center[0], -0.005, center[2]]} />
      </R3FCanvas>
    </div>
  );
}
