import { useState, useRef, useCallback, useEffect } from 'react';
import { MeadowCanvas } from './components/MeadowCanvas';
import { VirtualJoystick } from './components/VirtualJoystick';
import { meadowAudio } from './audio/proceduralAudio';
import type { MeadowSceneController, MovementInput } from './types';

export function App() {
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showDesktopHint, setShowDesktopHint] = useState(true);
  const controllerRef = useRef<MeadowSceneController | null>(null);

  // Detect touch devices
  useEffect(() => {
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    setIsTouchDevice(isTouch);
  }, []);

  // Fade desktop controls hint after 5.5 seconds
  useEffect(() => {
    const timer = setTimeout(() => setShowDesktopHint(false), 5500);
    return () => clearTimeout(timer);
  }, []);

  // Unlock Web Audio on first user gesture
  useEffect(() => {
    const handleFirstGesture = () => {
      meadowAudio.start();
      window.removeEventListener('pointerdown', handleFirstGesture);
      window.removeEventListener('keydown', handleFirstGesture);
    };

    window.addEventListener('pointerdown', handleFirstGesture);
    window.addEventListener('keydown', handleFirstGesture);

    return () => {
      window.removeEventListener('pointerdown', handleFirstGesture);
      window.removeEventListener('keydown', handleFirstGesture);
      meadowAudio.dispose();
    };
  }, []);

  const handleControllerReady = useCallback((controller: MeadowSceneController) => {
    controllerRef.current = controller;
  }, []);

  const handleJoystickMove = useCallback((input: MovementInput) => {
    if (controllerRef.current) {
      controllerRef.current.setInput(input);
    }
    meadowAudio.start();
  }, []);

  const handleJump = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.triggerJump?.();
    }
    meadowAudio.start();
  }, []);

  const handleRoll = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.triggerRoll?.();
    }
    meadowAudio.start();
  }, []);

  const handleEmote = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.triggerEmote?.();
    }
    meadowAudio.start();
  }, []);

  const handleToggleAudio = useCallback(() => {
    const muted = meadowAudio.toggleMute();
    setIsMuted(muted);
  }, []);

  const handleResetKnight = useCallback(() => {
    controllerRef.current?.restart?.();
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden select-none bg-[#3ea4ed]">
      {/* 3D Immersive Meadow Scene */}
      <MeadowCanvas onControllerReady={handleControllerReady} />

      {/* Minimal Top-Right Quick Utility Buttons (Audio & Reset) */}
      <div className="fixed top-3.5 right-3.5 z-30 flex items-center gap-2 pointer-events-auto">
        <button
          onClick={handleToggleAudio}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-950/35 hover:bg-emerald-950/50 backdrop-blur-md border border-white/20 text-emerald-100 text-xs font-semibold shadow-md transition active:scale-90 cursor-pointer"
          title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
          aria-label={isMuted ? 'Unmute Audio' : 'Mute Audio'}
        >
          <span>{isMuted ? '🔇' : '🔊'}</span>
          <span className="text-[11px] font-medium">{isMuted ? 'Muted' : 'Sound'}</span>
        </button>

        <button
          onClick={handleResetKnight}
          className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-950/35 hover:bg-emerald-950/50 backdrop-blur-md border border-white/20 text-emerald-100 text-sm shadow-md transition active:scale-90 cursor-pointer"
          title="Reset knight to campsite path"
          aria-label="Reset character position"
        >
          ↺
        </button>
      </div>

      {/* Discrete Desktop Controls Badge (Auto-fades) */}
      {!isTouchDevice && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-20 transition-opacity duration-1000 pointer-events-none ${
            showDesktopHint ? 'opacity-90' : 'opacity-0'
          }`}
        >
          <div className="px-4 py-1.5 rounded-full bg-stone-950/50 backdrop-blur-md border border-white/15 text-stone-200 text-[11px] font-sans tracking-wide shadow-lg">
            WASD to Move · Space to Jump · Shift to Sprint · C to Roll · V to Cheer · Drag to Orbit
          </div>
        </div>
      )}

      {/* Pure Controls Overlay (Left Joystick, Right Jump & Actions) */}
      <VirtualJoystick
        onMove={handleJoystickMove}
        onJump={handleJump}
        onRoll={handleRoll}
        onEmote={handleEmote}
        isTouchDevice={isTouchDevice}
      />
    </div>
  );
}

export default App;
