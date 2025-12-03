import React, { useRef, useEffect } from 'react';
import { Vector3, TerrainType } from '../types';
import { TERRAIN_COLORS, HOLE_DISTANCE } from '../constants';

interface GameCanvasProps {
  ballPos: Vector3;
  targetDistance: number;
}

const GameCanvas: React.FC<GameCanvasProps> = ({ ballPos, targetDistance }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // --- 3D Projection Settings ---
    const width = canvas.width;
    const height = canvas.height;
    
    // Camera params
    const camHeight = 1.5; // Meters off ground
    const camDist = -2.0;  // Meters behind ball (initially)
    const fov = 300;       // Field of view scale factor

    // If ball flies far, camera follows but lags behind slightly in Z, and stays up
    // For this simple demo, let's keep camera fixed at relative position to ball's start Z for flight
    // Or follow ball Z? Let's follow ball Z partially.
    
    const camZ = Math.max(-2, ballPos.z - 5); 
    // Camera looks at:
    // const lookAtZ = ballPos.z + 50;

    const project = (x: number, y: number, z: number) => {
      // Relative to camera
      const rx = x;
      const ry = y - camHeight;
      const rz = z - camZ;

      if (rz <= 0) return null; // Behind camera

      const scale = fov / rz;
      const screenX = width / 2 + rx * scale;
      const screenY = height / 2 - ry * scale; // Y is up in 3D, down in 2D
      return { x: screenX, y: screenY, scale };
    };

    // --- Render Loop ---
    
    // Sky
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#60a5fa'); // Sky Blue
    gradient.addColorStop(0.6, '#bfdbfe'); // Lighter Blue
    gradient.addColorStop(0.6, '#166534'); // Horizon Line (Ground)
    gradient.addColorStop(1, '#14532d'); // Darker Ground
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // --- Draw Terrain (Simple Rectangles/Trapezoids) ---
    // We draw "slices" of terrain to simulate depth
    const drawQuad = (zStart: number, zEnd: number, widthAtZ: number, color: string) => {
      const p1 = project(-widthAtZ, 0, zStart);
      const p2 = project(widthAtZ, 0, zStart);
      const p3 = project(widthAtZ, 0, zEnd);
      const p4 = project(-widthAtZ, 0, zEnd);

      if (!p1 || !p2 || !p3 || !p4) return;

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.lineTo(p4.x, p4.y);
      ctx.fill();
    };

    // 1. Rough (Base)
    drawQuad(0, HOLE_DISTANCE + 50, 100, TERRAIN_COLORS[TerrainType.ROUGH]);

    // 2. Fairway (Curved strip)
    // Simplified as straight strip for MVP
    drawQuad(10, HOLE_DISTANCE - 20, 20, TERRAIN_COLORS[TerrainType.FAIRWAY]);

    // 3. Green
    const greenCenterZ = HOLE_DISTANCE;
    const greenRadius = 15;
    // Draw approximate circle (polygon)
    ctx.fillStyle = TERRAIN_COLORS[TerrainType.GREEN];
    ctx.beginPath();
    for(let i=0; i<=20; i++) {
        const angle = (i / 20) * Math.PI * 2;
        const gx = Math.cos(angle) * greenRadius;
        const gz = greenCenterZ + Math.sin(angle) * greenRadius;
        const p = project(gx, 0, gz);
        if (p) {
           if (i===0) ctx.moveTo(p.x, p.y);
           else ctx.lineTo(p.x, p.y);
        }
    }
    ctx.fill();

    // 4. Hole
    const pHole = project(0, 0, HOLE_DISTANCE);
    if (pHole) {
        ctx.fillStyle = TERRAIN_COLORS[TerrainType.HOLE];
        ctx.beginPath();
        ctx.ellipse(pHole.x, pHole.y, 4 * pHole.scale, 1 * pHole.scale, 0, 0, Math.PI * 2);
        ctx.fill();

        // Flag
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(pHole.x, pHole.y);
        ctx.lineTo(pHole.x, pHole.y - 200 * pHole.scale); // Pole
        ctx.stroke();
        
        ctx.fillStyle = '#ef4444'; // Red flag
        ctx.beginPath();
        ctx.moveTo(pHole.x, pHole.y - 200 * pHole.scale);
        ctx.lineTo(pHole.x + 30 * pHole.scale, pHole.y - 180 * pHole.scale);
        ctx.lineTo(pHole.x, pHole.y - 160 * pHole.scale);
        ctx.fill();
    }

    // --- Draw Ball ---
    const pBall = project(ballPos.x, ballPos.y, ballPos.z);
    if (pBall) {
        // Shadow
        const pShadow = project(ballPos.x, 0, ballPos.z);
        if (pShadow) {
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.beginPath();
            const shadowSize = 5 * pShadow.scale * (1 - Math.min(ballPos.y / 20, 0.8));
            ctx.ellipse(pShadow.x, pShadow.y, shadowSize, shadowSize * 0.3, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // Ball Body
        ctx.fillStyle = 'white';
        ctx.beginPath();
        const ballRadius = 5 * pBall.scale;
        ctx.arc(pBall.x, pBall.y, Math.max(1, ballRadius), 0, Math.PI * 2);
        ctx.fill();
        
        // Pseudo-shading
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    // Distance Markers
    ctx.fillStyle = 'white';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    for (let d = 50; d < HOLE_DISTANCE; d+=50) {
        const p = project(25, 0, d);
        if (p) {
            ctx.fillText(`${d}m`, p.x, p.y);
        }
    }


  }, [ballPos, targetDistance]);

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={800}
      className="w-full h-full object-cover rounded-xl shadow-inner bg-blue-300"
    />
  );
};

export default GameCanvas;
