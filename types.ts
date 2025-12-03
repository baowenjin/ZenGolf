export enum GameState {
  INTRO = 'INTRO',
  CONNECTING = 'CONNECTING',
  IDLE = 'IDLE',          // Standing at tee
  ADDRESS = 'ADDRESS',    // Holding button, ready to hit
  SWINGING = 'SWINGING',  // Active swing motion detected
  BALL_FLYING = 'BALL_FLYING',
  RESULT = 'RESULT',
}

export enum TerrainType {
  TEE = 'Tee Box',
  FAIRWAY = 'Fairway',
  ROUGH = 'Rough',
  SAND = 'Sand Trap',
  GREEN = 'Green',
  WATER = 'Water Hazard',
  HOLE = 'Hole',
}

export interface Vector2 {
  x: number;
  y: number;
}

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface ShotResult {
  distance: number;
  carry: number;
  deviation: number; // meters left/right
  landingTerrain: TerrainType;
  strokes: number;
  power: number; // 0-100
  accuracy: number; // 0-100
}

export interface JoyConData {
  accel: { x: number; y: number; z: number };
  gyro: { x: number; y: number; z: number };
  buttons: {
    zr: boolean;
    zl: boolean;
    r: boolean;
    l: boolean;
    a: boolean;
    b: boolean;
    x: boolean;
    y: boolean;
  };
}

export type InputMode = 'MOUSE' | 'JOYCON';
