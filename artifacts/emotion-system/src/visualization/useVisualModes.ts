import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlaybackMode, VisualMode } from '../visual-controls/VisualModeControls';

export function useVisualModes(running: boolean) {
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>('auto');
  const [visualMode, setVisualMode] = useState<VisualMode>('surveillance');
  const [previousMode, setPreviousMode] = useState<VisualMode>('surveillance');
  const [transitionKey, setTransitionKey] = useState(0);
  const [originalDwellSeconds, setOriginalDwellSeconds] = useState(3);
  const [scanDwellSeconds, setScanDwellSeconds] = useState(2);
  const [glitchDurationSeconds, setGlitchDurationSeconds] = useState(0.22);
  const [renderScale, setRenderScale] = useState(0.7);
  const modeRef = useRef(visualMode);
  modeRef.current = visualMode;

  const transitionTo = useCallback((next: VisualMode) => {
    if (modeRef.current === next) return;
    setPreviousMode(modeRef.current);
    modeRef.current = next;
    setVisualMode(next);
    setTransitionKey((key) => key + 1);
  }, []);

  const chooseMode = useCallback((next: VisualMode) => {
    transitionTo(next);
  }, [transitionTo]);

  useEffect(() => {
    if (!running || playbackMode !== 'auto') return;
    const dwell = visualMode === 'surveillance' ? originalDwellSeconds : scanDwellSeconds;
    const next = visualMode === 'surveillance' ? 'scan' : 'surveillance';
    const timer = window.setTimeout(
      () => transitionTo(next),
      (dwell + glitchDurationSeconds) * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [
    running,
    playbackMode,
    visualMode,
    originalDwellSeconds,
    scanDwellSeconds,
    glitchDurationSeconds,
    transitionTo,
  ]);

  return {
    playbackMode,
    setPlaybackMode,
    visualMode,
    previousMode,
    transitionKey,
    originalDwellSeconds,
    setOriginalDwellSeconds,
    scanDwellSeconds,
    setScanDwellSeconds,
    glitchDurationSeconds,
    setGlitchDurationSeconds,
    renderScale,
    setRenderScale,
    chooseMode,
  };
}
