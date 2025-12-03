import React, { useState, useEffect, useRef, useCallback } from 'react';
import { joyConService } from './services/joyconService';
import { getCaddieCommentary } from './services/geminiService';
import { GameState, JoyConData, Vector3, ShotResult, TerrainType, InputMode } from './types';
import { HOLE_DISTANCE, CLUBS, MAX_POWER_GYRO, SWING_TRIGGER_THRESHOLD, GRAVITY, HOLE_POS_3D } from './constants';
import GameCanvas from './components/GameCanvas';
import ShotAnalysis from './components/ShotAnalysis';

const App: React.FC = () => {
  // --- State ---
  const [gameState, setGameState] = useState<GameState>(GameState.INTRO);
  const [inputMode, setInputMode] = useState<InputMode>('MOUSE');
  const [ballPos, setBallPos] = useState<Vector3>({ x: 0, y: 0, z: 0 });
  const [currentClubIndex, setCurrentClubIndex] = useState(0);
  
  // Gameplay UI State
  const [powerMeter, setPowerMeter] = useState(0); // 0-100 for UI visualization
  const [isAddressMode, setIsAddressMode] = useState(false); // Holding ZR?
  
  const [shotResult, setShotResult] = useState<ShotResult | null>(null);
  const [commentary, setCommentary] = useState<string>("");
  const [swingData, setSwingData] = useState<{ time: number; power: number }[]>([]);

  // --- Refs ---
  const ballVel = useRef<Vector3>({ x: 0, y: 0, z: 0 });
  const swingPeakPower = useRef(0);
  const isSwinging = useRef(false);
  const swingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animationFrameRef = useRef<number>(0);

  // --- Logic ---
  const resetGame = useCallback(() => {
    setBallPos({ x: 0, y: 0, z: 0 });
    setGameState(GameState.IDLE);
    setShotResult(null);
    setCommentary("");
    ballVel.current = { x: 0, y: 0, z: 0 };
  }, []);

  const executeShot = useCallback((power: number) => {
    setGameState(GameState.BALL_FLYING);
    setIsAddressMode(false);
    
    const club = CLUBS[currentClubIndex];
    
    // Physics Init
    const speed = club.maxDist * 0.25 * power; // Base speed tuning
    const loftRad = club.loft; // Angle up
    
    // Random deviation based on difficulty and power (harder to hit straight at full power)
    const accuracyNoise = (Math.random() - 0.5) * 0.1 * (power * club.difficulty); 

    ballVel.current = {
      x: Math.sin(accuracyNoise) * speed, // Left/Right
      y: Math.sin(loftRad) * speed * 1.5, // Up (Y is Up)
      z: Math.cos(loftRad) * speed * Math.cos(accuracyNoise) // Forward
    };

    setShotResult(null);
  }, [currentClubIndex]);

  const finishSwing = useCallback((wasHoldingTrigger: boolean) => {
    isSwinging.current = false;
    
    // Normalize power 0.0 - 1.0 (clamped slightly above 1.0 for "Nice Shot" feel)
    const powerRatio = Math.min(swingPeakPower.current / MAX_POWER_GYRO, 1.1);

    if (wasHoldingTrigger && powerRatio > 0.1) {
       // EXECUTE REAL SHOT
       executeShot(powerRatio);
    } else {
       // JUST PRACTICE
       // Reset state to IDLE if we were swinging but didn't commit
       if (gameState === GameState.SWINGING) {
         setGameState(GameState.ADDRESS); // Go back to address
       }
    }
  }, [gameState, executeShot]);

  // --- Core Input Loop ---
  const processJoyConData = (data: JoyConData) => {
    // 1. Global Reset (Check this FIRST to avoid TS unreachable code errors and allow resetting from Result)
    const holdingReset = data.buttons.b || data.buttons.y;
    if (holdingReset && gameState === GameState.RESULT) {
       resetGame();
       return;
    }

    // 2. Playable State Filter
    if (gameState !== GameState.IDLE && gameState !== GameState.ADDRESS && gameState !== GameState.SWINGING) return;

    // 3. Button State (Address Mode)
    // Nintendo Sports Golf: Hold ZR/ZL to address the ball.
    const holdingTrigger = data.buttons.zr || data.buttons.zl;

    // Update Address Mode UI
    if (gameState === GameState.IDLE || gameState === GameState.ADDRESS) {
      if (holdingTrigger && !isAddressMode) {
        setIsAddressMode(true);
        setGameState(GameState.ADDRESS);
      } else if (!holdingTrigger && isAddressMode) {
        setIsAddressMode(false);
        setGameState(GameState.IDLE);
      }
    }

    // 4. Swing Detection
    // Calculate magnitude of angular velocity (Gyro)
    const gyroMag = Math.sqrt(data.gyro.x * data.gyro.x + data.gyro.y * data.gyro.y + data.gyro.z * data.gyro.z);
    
    // Smooth power meter for UI
    const instantPower = Math.min((gyroMag / MAX_POWER_GYRO) * 100, 100);
    setPowerMeter(prev => prev * 0.8 + instantPower * 0.2); // Simple lerp for smoothness

    // Detect Swing Start
    if (!isSwinging.current && gyroMag > SWING_TRIGGER_THRESHOLD) {
      isSwinging.current = true;
      swingPeakPower.current = 0;
      setSwingData([]);
      
      // If holding trigger, this is a REAL shot
      if (holdingTrigger) {
         setGameState(GameState.SWINGING);
      }

      // Start a capture window (e.g., 400ms) to find peak velocity
      if (swingTimer.current) clearTimeout(swingTimer.current);
      swingTimer.current = setTimeout(() => {
         finishSwing(holdingTrigger);
      }, 400);
    }

    // While swinging, track peak
    if (isSwinging.current) {
       if (gyroMag > swingPeakPower.current) {
         swingPeakPower.current = gyroMag;
       }
       // Record graph data
       setSwingData(prev => [...prev.slice(-40), { time: Date.now(), power: gyroMag }]);
    }
  };

  // --- Subscription Management ---
  // Ensure the subscription uses the latest state closure
  useEffect(() => {
    if (inputMode === 'JOYCON') {
      joyConService.subscribe(processJoyConData);
    }
    // No cleanup needed for subscription replacement as it just overwrites callback
  }, [inputMode, gameState, isAddressMode, currentClubIndex, resetGame, executeShot, finishSwing]);


  const handleJoyConConnect = async () => {
    const success = await joyConService.connect();
    if (success) {
      setInputMode('JOYCON');
      setGameState(GameState.IDLE);
      // Subscription is handled by the useEffect above
    } else {
      alert("Could not connect to Joy-Con. Ensure it is paired via Bluetooth.");
    }
  };


  // --- Physics Loop ---
  const updatePhysics = useCallback(() => {
    if (gameState === GameState.BALL_FLYING) {
      setBallPos(prev => {
        const next = {
          x: prev.x + ballVel.current.x,
          y: prev.y + ballVel.current.y,
          z: prev.z + ballVel.current.z
        };
        
        // Floor Collision
        if (next.y <= 0) {
           next.y = 0;
           
           // Bounce logic
           if (Math.abs(ballVel.current.y) > 0.5) {
             ballVel.current.y *= -0.5; // Bounce energy loss
             ballVel.current.z *= 0.7; // Friction on bounce
             ballVel.current.x *= 0.7;
           } else {
             // Roll
             ballVel.current.y = 0;
             ballVel.current.z *= 0.95; // Rolling friction
             ballVel.current.x *= 0.95;
           }
        } else {
           // Air drag and Gravity
           ballVel.current.y -= GRAVITY * 0.016; // Gravity per frame (approx 60fps)
           ballVel.current.z *= 0.995; // Air drag
           ballVel.current.x *= 0.995;
        }

        return next;
      });

      // Stop Condition
      if (ballPos.y <= 0 && Math.abs(ballVel.current.z) < 0.1 && Math.abs(ballVel.current.y) < 0.1) {
         endShot();
      }
    }

    animationFrameRef.current = requestAnimationFrame(updatePhysics);
  }, [gameState, ballPos]);

  const endShot = () => {
    setGameState(GameState.RESULT);
    
    // Calculate outcome
    const dist = ballPos.z;
    const deviation = ballPos.x;
    const distToHole = Math.hypot(ballPos.x - HOLE_POS_3D.x, ballPos.z - HOLE_POS_3D.z);
    
    let terrain = TerrainType.ROUGH;
    if (distToHole < 1) terrain = TerrainType.HOLE;
    else if (distToHole < 15) terrain = TerrainType.GREEN;
    else if (Math.abs(deviation) < 10) terrain = TerrainType.FAIRWAY;
    
    const result: ShotResult = {
      distance: dist,
      carry: dist, // simple for now
      deviation,
      landingTerrain: terrain,
      strokes: 1,
      power: 0,
      accuracy: 0
    };
    
    setShotResult(result);
    setCommentary("Reading the green...");
    getCaddieCommentary(result).then(setCommentary);
  };

  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(updatePhysics);
    return () => cancelAnimationFrame(animationFrameRef.current);
  }, [updatePhysics]);

  // --- Render ---

  return (
    <div className="h-screen w-full bg-neutral-900 flex flex-col items-center justify-center font-sans overflow-hidden select-none">
      
      {/* --- Intro Screen --- */}
      {gameState === GameState.INTRO && (
        <div className="absolute inset-0 z-50 bg-gradient-to-br from-green-600 to-teal-800 flex flex-col items-center justify-center text-white p-6">
          <div className="bg-white/10 p-12 rounded-3xl backdrop-blur-sm border border-white/20 text-center max-w-lg shadow-2xl">
            <h1 className="text-6xl font-black mb-2 tracking-tighter italic">ZeroGOLF</h1>
            <p className="text-xl font-light mb-8 text-green-100">Web Motion Sports</p>
            
            <button
              onClick={handleJoyConConnect}
              className="w-full py-4 bg-yellow-400 hover:bg-yellow-300 text-yellow-900 rounded-2xl font-bold text-xl transition-transform active:scale-95 shadow-lg flex items-center justify-center gap-2"
            >
              <span>🎮</span> Connect Joy-Con
            </button>
            <p className="mt-4 text-sm opacity-60">Requires Bluetooth & Chrome/Edge</p>
          </div>
        </div>
      )}

      {/* --- Game Container --- */}
      {gameState !== GameState.INTRO && (
        <div className="relative w-full max-w-4xl aspect-[3/4] md:aspect-video bg-black rounded-xl overflow-hidden shadow-2xl ring-8 ring-neutral-800">
          
          {/* 3D Canvas Layer */}
          <div className="absolute inset-0">
             <GameCanvas ballPos={ballPos} targetDistance={HOLE_DISTANCE} />
          </div>

          {/* --- HUD Layer --- */}
          <div className="absolute inset-0 pointer-events-none p-6 flex flex-col justify-between">
            
            {/* Top Info */}
            <div className="flex justify-between items-start">
               <div className="bg-black/50 backdrop-blur-md text-white px-6 py-3 rounded-full border border-white/10">
                 <div className="text-xs text-green-400 font-bold uppercase tracking-wider">Hole 1</div>
                 <div className="text-2xl font-black italic">PAR 4 <span className="text-gray-400 text-lg not-italic mx-1">|</span> {HOLE_DISTANCE}m</div>
               </div>
               
               <div className="bg-white/90 text-black px-6 py-3 rounded-full font-bold shadow-lg">
                  {CLUBS[currentClubIndex].name}
               </div>
            </div>

            {/* Center Feedback (Practice/Address) */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center w-full">
               
               {gameState === GameState.BALL_FLYING && (
                 <div className="text-6xl font-black text-white italic drop-shadow-lg animate-pulse">
                    FLYING!
                 </div>
               )}

               {gameState === GameState.IDLE && (
                 <div className="flex flex-col items-center animate-bounce-slow">
                   <div className="text-white text-lg font-medium bg-black/40 px-4 py-1 rounded-full mb-2">
                     Practice Mode
                   </div>
                   <div className="text-yellow-400 font-bold text-xl drop-shadow-md">
                     Swing to test power
                   </div>
                 </div>
               )}

               {gameState === GameState.ADDRESS && (
                 <div className="flex flex-col items-center">
                   <div className="w-16 h-16 rounded-full border-4 border-red-500 bg-red-500/20 animate-ping absolute"></div>
                   <div className="text-white text-3xl font-black bg-red-600 px-6 py-2 rounded-xl shadow-lg border-2 border-white transform scale-110 transition-transform">
                     READY TO HIT
                   </div>
                   <p className="text-white mt-2 font-bold text-shadow">Swing Now!</p>
                 </div>
               )}
            </div>

            {/* Bottom Controls & Meters */}
            <div className="flex flex-col gap-4">
              
              {/* JoyCon Instructions */}
              <div className="self-center bg-black/60 backdrop-blur text-white px-6 py-2 rounded-2xl border border-white/10 text-sm flex items-center gap-4">
                 <div className={`flex items-center gap-2 ${isAddressMode ? 'opacity-50' : 'text-yellow-300 font-bold'}`}>
                    <span>✋</span> Practice Swing
                 </div>
                 <div className="h-4 w-px bg-white/20"></div>
                 <div className={`flex items-center gap-2 ${isAddressMode ? 'text-red-400 font-bold scale-110' : 'opacity-70'}`}>
                    <span className="border border-current px-1 rounded text-xs">ZR</span> Hold to Hit
                 </div>
              </div>

              {/* Power Meter Gauge */}
              <div className="w-full h-8 bg-gray-800/80 rounded-full overflow-hidden border-2 border-white/20 relative">
                 {/* Target Zone */}
                 <div className="absolute top-0 bottom-0 right-[10%] w-[5%] bg-yellow-500/50 z-10"></div>
                 
                 {/* Fill Bar */}
                 <div 
                   className={`h-full transition-all duration-75 ease-out ${
                     powerMeter > 90 ? 'bg-red-500' : isAddressMode ? 'bg-blue-500' : 'bg-green-500'
                   }`}
                   style={{ width: `${powerMeter}%` }}
                 />
                 
                 {/* Markers */}
                 <div className="absolute inset-0 flex justify-between px-4 items-center text-xs font-bold text-white/50 mix-blend-overlay">
                    <span>0</span>
                    <span>50</span>
                    <span>100</span>
                 </div>
              </div>

              {/* Result Modal Overlay */}
              {gameState === GameState.RESULT && shotResult && (
                <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-8 z-50">
                  <div className="bg-white text-black p-8 rounded-3xl w-full max-w-sm text-center shadow-2xl animate-fade-in-up">
                    <h2 className="text-4xl font-black italic mb-2 uppercase text-green-600">
                      {shotResult.landingTerrain}
                    </h2>
                    <div className="text-6xl font-bold mb-6">
                      {shotResult.distance.toFixed(1)}<span className="text-2xl text-gray-500">m</span>
                    </div>
                    
                    <div className="bg-gray-100 p-4 rounded-xl mb-6 text-left border-l-4 border-blue-500">
                      <p className="text-xs font-bold text-gray-400 uppercase mb-1">Caddie says:</p>
                      <p className="text-gray-800 font-medium leading-tight">"{commentary}"</p>
                    </div>

                    <div className="h-24 w-full mb-4">
                      <ShotAnalysis data={swingData} />
                    </div>

                    <button 
                      onClick={() => {
                        if (shotResult.landingTerrain === TerrainType.HOLE) {
                          alert("Hole in One! (Or close enough). Resetting...");
                          resetGame();
                        } else {
                          // For MVP, we just reset to Tee to practice again
                          setGameState(GameState.IDLE);
                          resetGame();
                        }
                      }}
                      className="w-full py-4 bg-black text-white font-bold rounded-xl hover:bg-gray-800 transition-colors"
                    >
                      Next Shot
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;