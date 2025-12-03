import { TerrainType, Vector3 } from './types';

// World Scale: 1 unit = 1 meter
export const WORLD_WIDTH = 100;
export const HOLE_DISTANCE = 300; 

// Initial Positions (3D)
// X: Left/Right, Y: Up/Down (Height), Z: Forward/Backward
export const TEE_POS_3D: Vector3 = { x: 0, y: 0, z: 0 };
export const HOLE_POS_3D: Vector3 = { x: 0, y: 0, z: HOLE_DISTANCE };

export const CLUBS = [
  { name: 'Driver', maxDist: 280, loft: 0.2, difficulty: 1.0 },
  { name: 'Iron 7', maxDist: 160, loft: 0.4, difficulty: 0.7 },
  { name: 'Wedge', maxDist: 90, loft: 0.7, difficulty: 0.4 },
  { name: 'Putter', maxDist: 30, loft: 0.0, difficulty: 0.1 },
];

export const TERRAIN_COLORS: Record<TerrainType, string> = {
  [TerrainType.TEE]: '#84cc16', // lime-500
  [TerrainType.FAIRWAY]: '#4ade80', // green-400
  [TerrainType.ROUGH]: '#166534', // green-800
  [TerrainType.SAND]: '#fde047', // yellow-300
  [TerrainType.GREEN]: '#86efac', // green-300
  [TerrainType.WATER]: '#3b82f6', // blue-500
  [TerrainType.HOLE]: '#1f2937', // gray-800
};

// Physics
export const GRAVITY = 9.8; 
export const MAX_POWER_GYRO = 18.0; // Higher threshold for "Full Power" swing
export const SWING_TRIGGER_THRESHOLD = 3.0; // Rad/s to detect "Swing Started"
