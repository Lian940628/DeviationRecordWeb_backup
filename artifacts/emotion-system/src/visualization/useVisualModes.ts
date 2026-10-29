import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlaybackMode, VisualMode } from '../visual-controls/VisualModeControls';

export const VISUAL_STAGE_ORDER: VisualMode[] = ['normal', 'anomaly', 'particle', 'line'];

/** Transitions that receive a short glitch; all others are hard cuts. */
const GLITCH_INTO: Record<VisualMode, boolean> = {
  normal: true,
  anomaly: false,
  particle: true,
  line: false,
};

export function useVisualModes(running: boolean) {
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>('auto');
  const [visualMode, setVisualMode] = useState<VisualMode>('normal');
  const [previousMode, setPreviousMode] = useState<VisualMode>('normal');
  const [transitionKey, setTransitionKey] = useState(0);
  const [transitionGlitch, setTransitionGlitch] = useState(false);
  const [normalDwellSeconds, setNormalDwellSeconds] = useState(1.4);
  const [anomalyDwellSeconds, setAnomalyDwellSeconds] = useState(0.7);
  const [particleDwellSeconds, setParticleDwellSeconds] = useState(0.9);
  const [lineDwellSeconds, setLineDwellSeconds] = useState(0.8);
  const [glitchDurationSeconds, setGlitchDurationSeconds] = useState(0.12);
  const [renderScale, setRenderScale] = useState(0.7);
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
    const dwell = {
      normal: normalDwellSeconds,
      anomaly: anomalyDwellSeconds,
      particle: particleDwellSeconds,
      line: lineDwellSeconds,
    }[visualMode];
    const index = VISUAL_STAGE_ORDER.indexOf(visualMode);
    const next = VISUAL_STAGE_ORDER[(index + 1) % VISUAL_STAGE_ORDER.length] ?? 'normal';
    // Glitch plays inside the next stage's dwell, so the cycle length is just the sum of dwells.
    const timer = window.setTimeout(() => transitionTo(next, GLITCH_INTO[next]), dwell * 1000);
    return () => window.clearTimeout(timer);
  }, [
    running,
    playbackMode,
    visualMode,
    normalDwellSeconds,
    anomalyDwellSeconds,
    particleDwellSeconds,
    lineDwellSeconds,
    transitionTo,
  ]);

  return {
    playbackMode,
    setPlaybackMode,
    visualMode,
    previousMode,
    transitionKey,
    transitionDurationSeconds: transitionGlitch ? glitchDurationSeconds : 0,
    normalDwellSeconds,
    setNormalDwellSeconds,
    anomalyDwellSeconds,
    setAnomalyDwellSeconds,
    particleDwellSeconds,
    setParticleDwellSeconds,
    lineDwellSeconds,
    setLineDwellSeconds,
    glitchDurationSeconds,
    setGlitchDurationSeconds,
    renderScale,
    setRenderScale,
    chooseMode,
  };
}
