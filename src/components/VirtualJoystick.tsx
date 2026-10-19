import React, { useRef, useState, useCallback, useEffect } from 'react';
import type { MovementInput } from '../types';

interface VirtualJoystickProps {
  onMove: (input: MovementInput) => void;
  onJump?: () => void;
  onRoll?: () => void;
  onEmote?: () => void;
  isTouchDevice?: boolean;
}

export const VirtualJoystick: React.FC<VirtualJoystickProps> = ({
  onMove,
  onJump,
  onRoll,
  onEmote,
}) => {
  const baseRef = useRef<HTMLDivElement>(null);
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });
  const [activeJoystickPointerId, setActiveJoystickPointerId] = useState<number | null>(null);
  const [isSprintZone, setIsSprintZone] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);

  const maxRadius = 56; // Thumb travel radius in pixels

  // Detect orientation for mobile landscape recommendation
  useEffect(() => {
    const checkOrientation = () => {
      const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const portrait = isTouch && window.innerHeight > window.innerWidth;
      setIsPortrait(portrait);
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  // -----------------------------------------------------------------
  // Left Thumb: Movement Joystick with Analog Displacement
  // -----------------------------------------------------------------
  const handleJoystickDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (activeJoystickPointerId !== null) return;
      setActiveJoystickPointerId(e.pointerId);

      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }

      if (baseRef.current) {
        const rect = baseRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const dx = e.clientX - centerX;
        const dy = e.clientY - centerY;
        const dist = Math.hypot(dx, dy);

        let cx = dx;
        let cy = dy;
        if (dist > maxRadius) {
          cx = (dx / dist) * maxRadius;
          cy = (dy / dist) * maxRadius;
        }

        const norm = dist / maxRadius;
        const sprint = norm >= 0.86;
        setIsSprintZone(sprint);

        setKnobPos({ x: cx, y: cy });
        onMove({
          x: cx / maxRadius,
          y: -cy / maxRadius,
          sprint,
        });
      }
    },
    [activeJoystickPointerId, maxRadius, onMove]
  );

  const handleJoystickMove = useCallback(
    (e: React.PointerEvent) => {
      if (activeJoystickPointerId !== e.pointerId || !baseRef.current) return;
      e.preventDefault();
      e.stopPropagation();

      const rect = baseRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = e.clientX - centerX;
      const dy = e.clientY - centerY;
      const dist = Math.hypot(dx, dy);

      let clampedX = dx;
      let clampedY = dy;
      if (dist > maxRadius) {
        clampedX = (dx / dist) * maxRadius;
        clampedY = (dy / dist) * maxRadius;
      }

      const norm = dist / maxRadius;
      const sprint = norm >= 0.86;
      setIsSprintZone(sprint);

      setKnobPos({ x: clampedX, y: clampedY });
      onMove({
        x: clampedX / maxRadius,
        y: -clampedY / maxRadius,
        sprint,
      });
    },
    [activeJoystickPointerId, maxRadius, onMove]
  );

  const handleJoystickUp = useCallback(
    (e: React.PointerEvent) => {
      if (activeJoystickPointerId === e.pointerId) {
        e.preventDefault();
        e.stopPropagation();
        setActiveJoystickPointerId(null);
        setIsSprintZone(false);
        setKnobPos({ x: 0, y: 0 });
        onMove({ x: 0, y: 0, sprint: false });
        try {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      }
    },
    [activeJoystickPointerId, onMove]
  );

  // Clean reset on application interruption or blur
  useEffect(() => {
    const handleReset = () => {
      setActiveJoystickPointerId(null);
      setIsSprintZone(false);
      setKnobPos({ x: 0, y: 0 });
      onMove({ x: 0, y: 0, sprint: false });
    };
    window.addEventListener('blur', handleReset);
    document.addEventListener('visibilitychange', handleReset);
    return () => {
      window.removeEventListener('blur', handleReset);
      document.removeEventListener('visibilitychange', handleReset);
    };
  }, [onMove]);

  return (
    <div className="fixed inset-0 pointer-events-none select-none z-20">
      {/* Portrait orientation prompt on mobile */}
      {isPortrait && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-stone-900/80 backdrop-blur-md border border-white/20 text-stone-200 text-xs shadow-lg flex items-center gap-2 pointer-events-auto">
          <span>🔄</span>
          <span>Rotate device to landscape for full meadow view</span>
        </div>
      )}

      {/* ========================================================= */}
      {/* 1. LEFT THUMB: Analog Virtual Joystick (Walk / Run / Sprint) */}
      {/* ========================================================= */}
      <div
        className="absolute bottom-7 left-7 pointer-events-auto touch-none"
        style={{ width: 148, height: 148 }}
      >
        <div
          ref={baseRef}
          onPointerDown={handleJoystickDown}
          onPointerMove={handleJoystickMove}
          onPointerUp={handleJoystickUp}
          onPointerCancel={handleJoystickUp}
          className="relative w-full h-full rounded-full bg-emerald-950/30 border border-white/25 shadow-2xl flex items-center justify-center cursor-grab active:cursor-grabbing transition-colors duration-150"
        >
          {/* Subtle directional orientation markers */}
          <div className="absolute top-2 w-1.5 h-1.5 rounded-full bg-white/45" />
          <div className="absolute bottom-2 w-1.5 h-1.5 rounded-full bg-white/45" />
          <div className="absolute left-2 w-1.5 h-1.5 rounded-full bg-white/45" />
          <div className="absolute right-2 w-1.5 h-1.5 rounded-full bg-white/45" />
          <div className="absolute inset-5 rounded-full border border-white/10 pointer-events-none" />

          {/* Draggable thumb knob with sprint ring */}
          <div
            className={`w-14 h-14 rounded-full border shadow-xl pointer-events-none transition-transform duration-75 flex items-center justify-center ${
              isSprintZone
                ? 'bg-amber-300/90 border-amber-100 ring-4 ring-amber-400/40'
                : 'bg-emerald-100/85 border-white/80'
            }`}
            style={{
              transform: `translate(${knobPos.x}px, ${knobPos.y}px)`,
            }}
          >
            <div
              className={`w-5 h-5 rounded-full border shadow-inner flex items-center justify-center ${
                isSprintZone
                  ? 'bg-amber-600/50 border-amber-700/30'
                  : 'bg-emerald-800/30 border-emerald-900/20'
              }`}
            >
              <div
                className={`w-1.5 h-1.5 rounded-full ${
                  isSprintZone ? 'bg-amber-900' : 'bg-emerald-700'
                }`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 2. RIGHT THUMB: Dedicated Jump Button & Exploration Actions */}
      {/* ========================================================= */}
      <div className="absolute bottom-7 right-7 pointer-events-auto flex flex-col items-end gap-3 select-none">
        {/* Auxiliary micro-action buttons: Dodge Roll & Salute */}
        <div className="flex items-center gap-2.5">
          {onEmote && (
            <button
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onEmote();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-stone-950/40 hover:bg-stone-900/60 active:scale-90 border border-white/20 shadow-lg text-amber-200 text-xs font-semibold tracking-wide transition duration-100 cursor-pointer"
              title="Salute / Cheer (V)"
              aria-label="Salute or Cheer"
            >
              <span>✨</span>
              <span className="text-[11px] text-white/90">Salute</span>
              <span className="text-[9px] font-mono opacity-50 ml-0.5">V</span>
            </button>
          )}

          {onRoll && (
            <button
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRoll();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-stone-950/40 hover:bg-stone-900/60 active:scale-90 border border-white/20 shadow-lg text-cyan-200 text-xs font-semibold tracking-wide transition duration-100 cursor-pointer"
              title="Dodge Roll (C)"
              aria-label="Dodge Roll"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.85.83 6.72 2.24L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
              <span className="text-[11px] text-white/90">Roll</span>
              <span className="text-[9px] font-mono opacity-50 ml-0.5">C</span>
            </button>
          )}
        </div>

        {/* Primary Jump Action Button (Immediate Touch Response) */}
        {onJump && (
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onJump();
            }}
            className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500/80 via-emerald-600/80 to-emerald-800/80 hover:from-emerald-400 hover:to-emerald-700 active:scale-90 border-2 border-emerald-200/90 shadow-2xl shadow-emerald-950/40 flex flex-col items-center justify-center text-white transition duration-100 cursor-pointer"
            title="Jump (Space)"
            aria-label="Jump"
          >
            <svg
              className="w-5 h-5 text-emerald-100"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
            <span className="text-[9px] font-extrabold tracking-widest uppercase mt-0.5 text-emerald-50">
              Jump
            </span>
            <span className="text-[8px] opacity-70 font-mono -mt-0.5">SPC</span>
          </button>
        )}
      </div>
    </div>
  );
};
