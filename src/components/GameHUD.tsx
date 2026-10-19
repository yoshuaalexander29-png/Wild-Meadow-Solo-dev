import React, { useState, useEffect } from 'react';

interface GameHUDProps {
  isMuted: boolean;
  isCinematic: boolean;
  onToggleAudio: () => void;
  onToggleCinematic: () => void;
  onRestart: () => void;
}

export const GameHUD: React.FC<GameHUDProps> = ({
  isMuted,
  isCinematic,
  onToggleAudio,
  onToggleCinematic,
  onRestart,
}) => {
  const [showHelpHint, setShowHelpHint] = useState(true);

  // Fade out desktop controls hint after 5.5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowHelpHint(false);
    }, 5500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-10 flex flex-col justify-between p-4">
      {/* Top Bar: Minimal Controls (Top Right) */}
      <header className="flex justify-between items-start w-full">
        {/* Subtle title note (clean unboxed text) */}
        <div className="text-emerald-950/70 dark:text-emerald-100/70 text-xs font-serif tracking-wider uppercase drop-shadow-sm select-none">
          Wild Meadow
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Sound Mute/Unmute */}
          <button
            onClick={onToggleAudio}
            className="px-3 py-1.5 rounded-full bg-emerald-950/35 hover:bg-emerald-950/50 backdrop-blur-md border border-white/20 text-emerald-100 text-xs font-medium tracking-wide shadow-sm transition active:scale-95 cursor-pointer"
            aria-label={isMuted ? 'Unmute Sound' : 'Mute Sound'}
          >
            {isMuted ? 'Sound: Muted' : 'Sound: On'}
          </button>

          {/* Cinematic Tour Toggle */}
          <button
            onClick={onToggleCinematic}
            className={`px-3 py-1.5 rounded-full backdrop-blur-md border text-xs font-medium tracking-wide shadow-sm transition active:scale-95 cursor-pointer ${
              isCinematic
                ? 'bg-amber-400/80 text-stone-900 border-amber-200'
                : 'bg-emerald-950/35 hover:bg-emerald-950/50 border-white/20 text-emerald-100'
            }`}
            aria-label="Toggle Cinematic Mode"
          >
            {isCinematic ? 'Exit Tour' : 'Cinematic Tour'}
          </button>

          {/* Quick Reset */}
          <button
            onClick={onRestart}
            className="px-2.5 py-1.5 rounded-full bg-emerald-950/25 hover:bg-emerald-950/45 backdrop-blur-md border border-white/15 text-emerald-100/80 hover:text-white text-xs transition active:scale-95 cursor-pointer"
            title="Reset to center"
            aria-label="Reset character position"
          >
            ↺
          </button>
        </div>
      </header>

      {/* Subtle First-Load Instruction Banner (Fades out automatically) */}
      <div
        className={`self-center transition-opacity duration-1000 select-none ${
          showHelpHint ? 'opacity-85' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="px-4 py-2 rounded-full bg-stone-900/60 backdrop-blur-md border border-white/15 text-stone-100 text-xs font-sans tracking-wide shadow-lg">
          <span className="hidden md:inline">
            WASD to Move · F to Slash · Space to Jump · C to Roll · V to Cheer · Shift to Sprint · Drag to Orbit
          </span>
          <span className="md:hidden">
            Joystick to Move · Slash / Jump / Roll / Cheer Action Buttons · Drag to Rotate Camera
          </span>
        </div>
      </div>

      {/* Empty bottom spacer for mobile safe-area */}
      <div className="h-6" />
    </div>
  );
};
