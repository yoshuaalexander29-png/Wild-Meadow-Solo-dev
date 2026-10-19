import React from 'react';

interface HudHeaderProps {
  isPaused: boolean;
  isMuted: boolean;
  onRestart: () => void;
  onTogglePause: () => void;
  onNextShot: () => void;
  onToggleAudio: () => void;
}

export const HudHeader: React.FC<HudHeaderProps> = ({
  isPaused,
  isMuted,
  onRestart,
  onTogglePause,
  onNextShot,
  onToggleAudio,
}) => {
  return (
    <header id="hud" className="fixed top-3 left-3 right-3 flex justify-between gap-2.5 pointer-events-none z-10">
      <div className="plate brand pointer-events-auto">
        <div className="eyebrow">Wild Meadow · Mondstadt Breeze</div>
        <strong>Where the gentle winds dwell</strong>
        <small>KNIGHT GUARDIAN · ANIME MEADOW</small>
      </div>

      <div className="plate actions pointer-events-auto flex items-start gap-1.5 flex-wrap justify-end">
        <button id="reset" className="action-btn" onClick={onRestart}>
          Restart
        </button>
        <button id="motion" className="action-btn" onClick={onTogglePause}>
          {isPaused ? 'Resume' : 'Pause'}
        </button>
        <button id="audio-toggle" className="action-btn" onClick={onToggleAudio}>
          {isMuted ? 'Sound: Muted' : 'Sound: On'}
        </button>
        <button id="cycle" className="action-btn wide" onClick={onNextShot}>
          Next shot ↗
        </button>
      </div>
    </header>
  );
};
