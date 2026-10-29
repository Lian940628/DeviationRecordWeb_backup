import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlaybackMode, VisualMode } from '../visual-controls/visualControlsTypes';
import type { VisualSettings } from './visualSettings';

export const VISUAL_STAGE_ORDER: VisualMode[] = ['normal', 'anomaly', 'particle', 'line'];

/** Transitions that receive a short glitch; all others are hard cuts. */
const GLITCH_INTO: Record<VisualMode, boolean> = {
  normal: true,
  anomaly: false,
  particle: true,
  line: false,
};

export function useVisualModes(running: boolean, settings: VisualSettings) {
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>('auto');
  const [visualMode, setVisualMode] = useState<VisualMode>('normal');
  const [previousMode, setPreviousMode] = useState<VisualMode>('normal');
  const [transitionKey, setTransitionKey] = useState(0);
  const [transitionGlitch, setTransitionGlitch] = useState(false);
  const modeRef = useRef(visualMode);
  modeRef.current = visualMode;

  const transitionTo = useCallback((next: VisualMode, glitch: boolean) => {
    if (modeRef.current === next) return;
    setPreviousMode(modeRef.current);
    modeRef.current = next;
    setVisualMode(next);
    setTransitionGlitch(glitch);
    setTransitionKey((key) => key + 1);
  }, []);

  const chooseMode = useCallback((next: VisualMode) => {
    setPlaybackMode('manual');
    transitionTo(next, false);
  }, [transitionTo]);

  useEffect(() => {
    if (!running || playbackMode !== 'auto') return;
    const dwell = settings.stages[visualMode].duration;
    const index = VISUAL_STAGE_ORDER.indexOf(visualMode);
    const next = VISUAL_STAGE_ORDER[(index + 1) % VISUAL_STAGE_ORDER.length] ?? 'normal';
    // Glitch plays inside the next stage's dwell, so the cycle length is just the sum of dwells.
    const timer = window.setTimeout(() => transitionTo(next, GLITCH_INTO[next]), dwell * 1000);
    return () => window.clearTimeout(timer);
  }, [
    running,
    playbackMode,
    visualMode,
    settings.stages[visualMode].duration,
    transitionTo,
  ]);

  return {
    playbackMode,
    setPlaybackMode,
    visualMode,
    previousMode,
    transitionKey,
    transitionDurationSeconds: transitionGlitch ? settings.transitions.glitchDurationSeconds : 0,
    chooseMode,
  };
}
