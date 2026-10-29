import { useCallback, useEffect, useRef } from 'react';
import type { StageAudioSettings, VisualStage } from './visualSettings';

type AudioContextConstructor = new () => AudioContext;

function getAudioContextConstructor(): AudioContextConstructor | null {
  const browserWindow = window as Window & { webkitAudioContext?: AudioContextConstructor };
  return window.AudioContext ?? browserWindow.webkitAudioContext ?? null;
}

export function useStageTransitionAudio(
  running: boolean,
  stage: VisualStage,
  transitionKey: number,
  settings: StageAudioSettings,
) {
  const contextRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const settingsRef = useRef(settings);
  const lastTransitionKeyRef = useRef<number | null>(null);
  const wasRunningRef = useRef(false);
  settingsRef.current = settings;

  const close = useCallback(async () => {
    const context = contextRef.current;
    contextRef.current = null;
    masterRef.current = null;
    if (context && context.state !== 'closed') {
      try {
        await context.close();
      } catch {
        // Audio cleanup is best-effort; it must not interfere with camera cleanup.
      }
    }
  }, []);

  const unlock = useCallback(async () => {
    const Constructor = getAudioContextConstructor();
    if (!Constructor) return false;
    try {
      let context = contextRef.current;
      if (!context || context.state === 'closed') {
        context = new Constructor();
        const master = context.createGain();
        master.gain.value = settingsRef.current.muted ? 0 : settingsRef.current.masterVolume;
        master.connect(context.destination);
        contextRef.current = context;
        masterRef.current = master;
      }
      if (context.state !== 'running') await context.resume();
      return context.state === 'running';
    } catch {
      return false;
    }
  }, []);

  const play = useCallback((nextStage: VisualStage) => {
    const preferences = settingsRef.current;
    const context = contextRef.current;
    const master = masterRef.current;
    if (
      !context ||
      !master ||
      context.state !== 'running' ||
      preferences.muted ||
      !preferences.enabledStages[nextStage] ||
      preferences.masterVolume <= 0
    ) return;

    const now = context.currentTime;
    master.gain.setTargetAtTime(preferences.masterVolume, now, 0.015);

    const playTone = (
      waveform: OscillatorType,
      startHz: number,
      endHz: number,
      duration: number,
      delay: number,
      cutoff: number,
    ) => {
      const oscillator = context.createOscillator();
      const filter = context.createBiquadFilter();
      const envelope = context.createGain();
      const startAt = now + delay;
      const endAt = startAt + duration;

      oscillator.type = waveform;
      oscillator.frequency.setValueAtTime(startHz, startAt);
      if (endHz !== startHz) oscillator.frequency.linearRampToValueAtTime(endHz, endAt);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(cutoff, startAt);
      envelope.gain.setValueAtTime(0.0001, startAt);
      envelope.gain.exponentialRampToValueAtTime(0.22, startAt + Math.min(0.025, duration * 0.2));
      envelope.gain.exponentialRampToValueAtTime(0.0001, endAt);
      oscillator.connect(filter);
      filter.connect(envelope);
      envelope.connect(master);
      oscillator.onended = () => {
        oscillator.disconnect();
        filter.disconnect();
        envelope.disconnect();
      };
      oscillator.start(startAt);
      oscillator.stop(endAt + 0.01);
    };

    switch (nextStage) {
      case 'normal':
        playTone('sine', 660, 660, 0.15, 0, 1500);
        break;
      case 'anomaly':
        playTone('square', 392, 392, 0.09, 0, 1200);
        playTone('square', 311, 311, 0.105, 0.13, 1200);
        break;
      case 'particle':
        playTone('triangle', 380, 790, 0.29, 0, 1900);
        break;
      case 'line':
        playTone('sawtooth', 780, 430, 0.27, 0, 1300);
        break;
    }
  }, []);

  useEffect(() => {
    if (!running) {
      lastTransitionKeyRef.current = transitionKey;
      if (wasRunningRef.current) {
        wasRunningRef.current = false;
        void close();
      }
      return;
    }

    wasRunningRef.current = true;
    if (lastTransitionKeyRef.current === null) {
      lastTransitionKeyRef.current = transitionKey;
      return;
    }
    if (lastTransitionKeyRef.current === transitionKey) return;
    lastTransitionKeyRef.current = transitionKey;
    play(stage);
  }, [running, stage, transitionKey, play, close]);

  useEffect(() => {
    const master = masterRef.current;
    const context = contextRef.current;
    if (master && context && context.state !== 'closed') {
      master.gain.setTargetAtTime(settings.muted ? 0 : settings.masterVolume, context.currentTime, 0.02);
    }
  }, [settings.muted, settings.masterVolume]);

  useEffect(() => () => { void close(); }, [close]);

  return { unlock, close };
}
