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
  stick: { x: number; y: number };
  buttons: {
    zr: boolean;
    zl: boolean;
    r: boolean;
    l: boolean;
    a: boolean;
    b: boolean;
    x: boolean;
    y: boolean;
    plus: boolean;
    minus: boolean;
    home: boolean;
    capture: boolean;
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
    stick: boolean; // Stick click
    rStickClick: boolean;
    lStickClick: boolean;
    sl: boolean;
    sr: boolean;
    [key: string]: boolean; // Index signature for logging iteration
  };
  rawHex?: string;
}

export type InputMode = 'MOUSE' | 'JOYCON';