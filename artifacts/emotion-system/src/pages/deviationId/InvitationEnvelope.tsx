import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnimationEvent as ReactAnimationEvent, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { AppLanguage } from '../../i18n';
import { deviationText as tx } from './copy';
import './DeviationIdNarrative.css';

export interface InvitationEnvelopeProps {
  fileId: string;
  language: AppLanguage;
  onOpened?: () => void;
}

type OpeningPhase = 'idle' | 'knife-picked-up' | 'cutting' | 'cut-complete' | 'paper-reveal' | 'envelope-fall' | 'step-02';

export function InvitationEnvelope({ fileId, language, onOpened }: InvitationEnvelopeProps) {
  const t = (value: string) => tx(language, value);
  const [opened, setOpened] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<OpeningPhase>('idle');
  const sceneRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const envelopeRef = useRef<HTMLDivElement>(null);
  const knifeRef = useRef<HTMLButtonElement>(null);
  const topEdgeOverlayRef = useRef<SVGSVGElement>(null);
  const bladeTipRef = useRef<SVGCircleElement>(null);
  const seamPathRef = useRef<SVGPathElement>(null);
  const pointerIdRef = useRef<number | null>(null);
  const progressRef = useRef(0);
  const phaseRef = useRef<OpeningPhase>('idle');
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastScratchAtRef = useRef(0);
  const openedRef = useRef(false);
  const mountedRef = useRef(false);
  const keyboardRef = useRef(false);
  const pendingPointerRef = useRef<{ x: number; y: number } | null>(null);
  const frameRef = useRef<number | null>(null);
  const edgeFrameRef = useRef<number | null>(null);
  const grabOffsetRef = useRef({ x: 0, y: 0 });
  const knifeAngleRef = useRef(-4);
  const lastPathProjectionRef = useRef<number | null>(null);
  const callbackRef = useRef(onOpened);
  const callbackIssuedRef = useRef(false);
  callbackRef.current = onOpened;

  const playPaperSound = useCallback((kind: 'cut' | 'slide' | 'confirm') => {
    try {
      const AudioConstructor = window.AudioContext;
      if (!AudioConstructor) return;
      const context = audioContextRef.current ?? new AudioConstructor();
      audioContextRef.current = context;
      if (context.state === 'suspended') void context.resume();
      const duration = kind === 'cut' ? 0.085 : kind === 'confirm' ? 0.24 : 0.32;
      const length = Math.floor(context.sampleRate * duration);
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const channel = buffer.getChannelData(0);
      for (let index = 0; index < length; index += 1) {
        const fade = Math.sin((index / length) * Math.PI);
        channel[index] = (Math.random() * 2 - 1) * fade;
      }
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const volume = context.createGain();
      source.buffer = buffer;
      filter.type = kind === 'cut' ? 'bandpass' : 'lowpass';
      filter.frequency.value = kind === 'cut' ? 1450 : kind === 'confirm' ? 920 : 720;
      filter.Q.value = kind === 'cut' ? 0.7 : 0.45;
      const now = context.currentTime;
      volume.gain.setValueAtTime(0.0001, now);
      volume.gain.exponentialRampToValueAtTime(kind === 'cut' ? 0.022 : 0.03, now + 0.025);
      volume.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      source.connect(filter);
      filter.connect(volume);
      volume.connect(context.destination);
      source.start(now);
      source.stop(now + duration);
    } catch {
      // Audio is decorative; unsupported or blocked audio never interrupts the cut.
    }
  }, []);

  const transitionTo = useCallback((next: OpeningPhase) => {
    if (phaseRef.current === next) return;
    phaseRef.current = next;
    setPhase(next);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      pointerIdRef.current = null;
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      if (edgeFrameRef.current !== null) cancelAnimationFrame(edgeFrameRef.current);
      const audioContext = audioContextRef.current;
      audioContextRef.current = null;
      if (audioContext && audioContext.state !== 'closed') {
        try {
          void audioContext.close().catch(() => undefined);
        } catch {
          // The browser may have closed the context while this component was unmounting.
        }
      }
    };
  }, []);

  useEffect(() => {
    const syncTopEdge = () => {
      const stage = stageRef.current;
      const source = seamPathRef.current;
      const overlay = topEdgeOverlayRef.current;
      const matrix = source?.getScreenCTM();
      if (stage && source && overlay && matrix) {
        const stageBounds = stage.getBoundingClientRect();
        const length = source.getTotalLength();
        const start = new DOMPoint(source.getPointAtLength(0).x, source.getPointAtLength(0).y).matrixTransform(matrix);
        const end = new DOMPoint(source.getPointAtLength(length).x, source.getPointAtLength(length).y).matrixTransform(matrix);
        const width = Math.max(1, stage.clientWidth);
        const height = Math.max(1, stage.clientHeight);
        const path = `M ${start.x - stageBounds.left} ${start.y - stageBounds.top} L ${end.x - stageBounds.left} ${end.y - stageBounds.top}`;
        overlay.setAttribute('viewBox', `0 0 ${width} ${height}`);
        overlay.querySelectorAll<SVGPathElement>('[data-top-edge-path]').forEach((element) => element.setAttribute('d', path));
      }
      edgeFrameRef.current = requestAnimationFrame(syncTopEdge);
    };
    edgeFrameRef.current = requestAnimationFrame(syncTopEdge);
    return () => {
      if (edgeFrameRef.current !== null) cancelAnimationFrame(edgeFrameRef.current);
      edgeFrameRef.current = null;
    };
  }, []);

  const completeCut = useCallback(() => {
    if (openedRef.current || progressRef.current < 100) return;
    openedRef.current = true;
    setOpened(true);
    setDragging(false);
    pointerIdRef.current = null;
    keyboardRef.current = false;
    transitionTo('cut-complete');
    playPaperSound('confirm');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced && !callbackIssuedRef.current) {
      callbackIssuedRef.current = true;
      transitionTo('step-02');
      callbackRef.current?.();
    }
  }, [playPaperSound, transitionTo]);

  const setCutProgress = useCallback((value: number) => {
    const next = Math.max(progressRef.current, Math.min(100, value));
    if (next === progressRef.current) return;
    progressRef.current = next;
    if (sceneRef.current) {
      sceneRef.current.style.setProperty('--cut-progress', `${next}%`);
      sceneRef.current.style.setProperty('--cut-dash-offset', `${1000 - next * 10}`);
      sceneRef.current.style.setProperty('--tear-lift', `${Math.min(9, next * 0.09)}px`);
      sceneRef.current.style.setProperty('--flap-angle', `${Math.min(18, next * 0.18)}deg`);
      const meter = sceneRef.current.querySelector<HTMLElement>('.di-story-envelope__meter');
      meter?.setAttribute('aria-valuenow', String(Math.round(next)));
    }
    if (next >= 100) completeCut();
  }, [completeCut]);

  const processPointerFrame = useCallback(() => {
    frameRef.current = null;
    const pointer = pendingPointerRef.current;
    const stage = stageRef.current;
    const knife = knifeRef.current;
    const tip = bladeTipRef.current;
    const seam = seamPathRef.current;
    if (!pointer || !stage || !knife || !tip || !seam || pointerIdRef.current === null || openedRef.current) return;

    const stageBounds = stage.getBoundingClientRect();
    const angle = knifeAngleRef.current * Math.PI / 180;
    const rotatedX = grabOffsetRef.current.x * Math.cos(angle) - grabOffsetRef.current.y * Math.sin(angle);
    const rotatedY = grabOffsetRef.current.x * Math.sin(angle) + grabOffsetRef.current.y * Math.cos(angle);
    const left = pointer.x - stageBounds.left - rotatedX;
    const top = pointer.y - stageBounds.top - rotatedY;
    knife.style.left = `${left}px`;
    knife.style.top = `${top}px`;
    knife.style.transform = `translate(-50%, -50%) rotate(${knifeAngleRef.current}deg)`;

    const matrix = tip.getScreenCTM();
    const seamMatrix = seam.getScreenCTM();
    if (!matrix || !seamMatrix) return;
    let tipPoint = new DOMPoint(5, 24).matrixTransform(matrix);
    const length = seam.getTotalLength();
    const start = seam.getPointAtLength(0);
    const end = seam.getPointAtLength(length);
    const screenStart = new DOMPoint(start.x, start.y).matrixTransform(seamMatrix);
    const screenEnd = new DOMPoint(end.x, end.y).matrixTransform(seamMatrix);
    const vectorX = screenEnd.x - screenStart.x;
    const vectorY = screenEnd.y - screenStart.y;
    const lengthSquared = vectorX * vectorX + vectorY * vectorY;
    let projection = ((tipPoint.x - screenStart.x) * vectorX + (tipPoint.y - screenStart.y) * vectorY) / lengthSquared;
    let distanceToStart = Math.hypot(tipPoint.x - screenStart.x, tipPoint.y - screenStart.y);
    const distanceToEnd = Math.hypot(tipPoint.x - screenEnd.x, tipPoint.y - screenEnd.y);
    const snapPoint = progressRef.current === 0 && projection <= 0.04 && distanceToStart <= 32
      ? screenStart
      : progressRef.current > 0 && projection >= 0.96 && distanceToEnd <= 32
        ? screenEnd
        : null;
    if (snapPoint) {
      const correctionX = snapPoint.x - tipPoint.x;
      const correctionY = snapPoint.y - tipPoint.y;
      const adjustedLeft = left + correctionX;
      const adjustedTop = top + correctionY;
      knife.style.left = `${adjustedLeft}px`;
      knife.style.top = `${adjustedTop}px`;
      grabOffsetRef.current.x -= correctionX;
      grabOffsetRef.current.y -= correctionY;
      const snappedMatrix = tip.getScreenCTM();
      if (snappedMatrix) {
        tipPoint = new DOMPoint(5, 24).matrixTransform(snappedMatrix);
        projection = ((tipPoint.x - screenStart.x) * vectorX + (tipPoint.y - screenStart.y) * vectorY) / lengthSquared;
      }
      if (snapPoint === screenStart) projection = 0;
      else if (snapPoint === screenEnd) projection = 1;
    }
    const clampedProjection = Math.max(0, Math.min(1, projection));
    const distance = Math.hypot(
      tipPoint.x - (screenStart.x + clampedProjection * vectorX),
      tipPoint.y - (screenStart.y + clampedProjection * vectorY),
    );
    const withinPath = projection >= 0 && projection <= 1 && distance <= 25;
    sceneRef.current?.classList.toggle('is-aligned', withinPath);
    if (!withinPath) {
      lastPathProjectionRef.current = projection;
      return;
    }

    const next = projection * 100;
    const current = progressRef.current;
    const previousProjection = lastPathProjectionRef.current;
    const atStart = current === 0
      && next <= 5
      && (previousProjection === null || projection >= previousProjection);
    const resumingAtCut = current > 0 && lastPathProjectionRef.current === null && next <= current + 1;
    const movingRight = previousProjection !== null
      && projection >= previousProjection
      && next >= current
      && (current > 0 || previousProjection <= 0.05);
    if (atStart || resumingAtCut || movingRight) {
      lastPathProjectionRef.current = projection;
      if (next > current && Date.now() - lastScratchAtRef.current > 110) {
        lastScratchAtRef.current = Date.now();
        playPaperSound('cut');
      }
      if (next > current && phaseRef.current !== 'cutting') transitionTo('cutting');
      setCutProgress(next);
    } else {
      lastPathProjectionRef.current = projection;
    }
  }, [playPaperSound, setCutProgress, transitionTo]);

  const updatePointer = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (pointerIdRef.current !== event.pointerId || openedRef.current) return;
    pendingPointerRef.current = { x: event.clientX, y: event.clientY };
    if (frameRef.current === null) frameRef.current = requestAnimationFrame(processPointerFrame);
  }, [processPointerFrame]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (openedRef.current) return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const radians = -knifeAngleRef.current * Math.PI / 180;
    const fromCenterX = event.clientX - (bounds.left + bounds.width / 2);
    const fromCenterY = event.clientY - (bounds.top + bounds.height / 2);
    const grabOffset = {
      x: fromCenterX * Math.cos(radians) - fromCenterY * Math.sin(radians),
      y: fromCenterX * Math.sin(radians) + fromCenterY * Math.cos(radians),
    };
    grabOffsetRef.current = grabOffset;
    pointerIdRef.current = event.pointerId;
    lastPathProjectionRef.current = null;
    if (phaseRef.current === 'idle') transitionTo('knife-picked-up');
    event.currentTarget.classList.add('is-held');
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    updatePointer(event);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    updatePointer(event);
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      processPointerFrame();
    }
    pointerIdRef.current = null;
    lastPathProjectionRef.current = null;
    setDragging(false);
    if (progressRef.current === 0 && phaseRef.current === 'knife-picked-up') transitionTo('idle');
    event.currentTarget.classList.remove('is-held');
    sceneRef.current?.classList.remove('is-aligned');
  };

  const positionKnifeAtProjection = (projection: number) => {
    const stage = stageRef.current;
    const seam = seamPathRef.current;
    const knife = knifeRef.current;
    const seamMatrix = seam?.getScreenCTM();
    if (!stage || !seam || !knife || !seamMatrix) return;
    const stageBounds = stage.getBoundingClientRect();
    const point = seam.getPointAtLength(seam.getTotalLength() * Math.max(0, Math.min(1, projection)));
    const screenPoint = new DOMPoint(point.x, point.y).matrixTransform(seamMatrix);
    knifeAngleRef.current = 0;
    knife.style.left = `${screenPoint.x - stageBounds.left}px`;
    knife.style.top = `${screenPoint.y - stageBounds.top}px`;
    knife.style.transform = 'translate(-50%, -50%) rotate(0deg)';
    const tip = bladeTipRef.current;
    const tipMatrix = tip?.getScreenCTM();
    if (tip && tipMatrix) {
      const currentTip = new DOMPoint(5, 24).matrixTransform(tipMatrix);
      knife.style.left = `${parseFloat(knife.style.left) + screenPoint.x - currentTip.x}px`;
      knife.style.top = `${parseFloat(knife.style.top) + screenPoint.y - currentTip.y}px`;
    }
    sceneRef.current?.classList.add('is-aligned');
  };

  const handleKeyboard = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (openedRef.current) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!keyboardRef.current) {
        keyboardRef.current = true;
        setDragging(true);
        if (phaseRef.current === 'idle') transitionTo('knife-picked-up');
        sceneRef.current?.classList.add('is-cutting');
        positionKnifeAtProjection(progressRef.current / 100);
      } else {
        const next = Math.min(100, progressRef.current + 8);
        positionKnifeAtProjection(next / 100);
        playPaperSound('cut');
        if (next > progressRef.current && phaseRef.current !== 'cutting') transitionTo('cutting');
        setCutProgress(next);
        if (progressRef.current >= 100) setDragging(false);
      }
    } else if (event.key === 'ArrowRight' && keyboardRef.current) {
      event.preventDefault();
      const next = Math.min(100, progressRef.current + 8);
      positionKnifeAtProjection(next / 100);
      playPaperSound('cut');
      if (next > progressRef.current && phaseRef.current !== 'cutting') transitionTo('cutting');
      setCutProgress(next);
      if (progressRef.current >= 100) setDragging(false);
    } else if (event.key === 'Escape' && keyboardRef.current) {
      keyboardRef.current = false;
      setDragging(false);
      sceneRef.current?.classList.remove('is-cutting');
      sceneRef.current?.classList.remove('is-aligned');
      if (progressRef.current === 0) transitionTo('idle');
    }
  };

  const handleFlapAnimationEnd = (event: ReactAnimationEvent<HTMLDivElement>) => {
    if (
      event.target === event.currentTarget
      && event.animationName === 'di-envelope-flap-separate'
      && phaseRef.current === 'cut-complete'
    ) {
      playPaperSound('slide');
      transitionTo('paper-reveal');
    }
  };

  const handleDossierAnimationEnd = (event: ReactAnimationEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.animationName === 'di-paper-reveal' && phaseRef.current === 'paper-reveal') {
      transitionTo('envelope-fall');
      return;
    }
    if (
      event.animationName === 'di-dossier-expand'
      && phaseRef.current === 'envelope-fall'
      && !callbackIssuedRef.current
    ) {
      callbackIssuedRef.current = true;
      transitionTo('step-02');
      callbackRef.current?.();
    }
  };

  const handleScenePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (pointerIdRef.current !== null || openedRef.current || !envelopeRef.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    envelopeRef.current.style.setProperty('--parallax-x', `${-y * 2.2}deg`);
    envelopeRef.current.style.setProperty('--parallax-y', `${x * 2.2}deg`);
  };

  return (
    <section
      ref={sceneRef}
      className={`di-story-envelope${opened ? ' is-opening' : ''}${dragging ? ' is-cutting' : ''}${phase !== 'idle' ? ` is-${phase}` : ''}`}
      data-opening-phase={phase}
      aria-label={t('Invitation envelope')}
      onPointerMove={handleScenePointerMove}
    >
      <div className="di-story-envelope__atmosphere" aria-hidden="true" />

      <div className="di-story-envelope__stage" ref={stageRef}>
        <div className="di-story-envelope__shadow" aria-hidden="true" />
        <div className="di-story-envelope__dossier" aria-hidden="true" onAnimationEnd={handleDossierAnimationEnd}>
          <span>EMOTION / SYSTEM</span>
          <b>PERSONNEL RECORD</b>
          <i>ADMISSION  ·  {fileId || 'UNASSIGNED'}</i>
          <small>NAME / SELF-DEFINITION / DEVIATION</small>
        </div>
        <div ref={envelopeRef} className="di-story-envelope__object">
          <div className="di-story-envelope__body">
            <div className="di-story-envelope__paper-grain" />
            <svg className="di-story-envelope__circuit" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true">
              <g className="di-story-envelope__circuit-lines">
                <path d="M0 70h110l30 30h132l24 24h93M1000 106h-92l-26 26h-118l-35 35h-86M0 492h104l25-25h126l40-40h84M1000 456h-110l-34-34H720l-26-26h-96M0 286h72l22-22h74M1000 308h-76l-25 25h-72" />
                <path d="M160 0v78l21 21v82M826 0v82l-22 22v48M219 600v-83l25-25v-58M773 600v-74l-27-27v-65M460 0v48l-18 18v48M548 600v-53l19-19v-50" />
                <path d="M68 198h92l22 22h78M932 219h-84l-24 24h-84M65 397h90l21-21h72M934 382h-80l-26-26h-76" />
              </g>
              <g className="di-story-envelope__circuit-nodes">
                <circle cx="110" cy="70" r="4" /><circle cx="389" cy="148" r="4" />
                <circle cx="908" cy="106" r="4" /><circle cx="643" cy="202" r="4" />
                <circle cx="104" cy="492" r="4" /><circle cx="379" cy="427" r="4" />
                <circle cx="890" cy="456" r="4" /><circle cx="598" cy="396" r="4" />
                <circle cx="160" cy="181" r="4" /><circle cx="826" cy="152" r="4" />
                <circle cx="219" cy="434" r="4" /><circle cx="773" cy="434" r="4" />
              </g>
            </svg>
            <div className="di-story-envelope__scan" aria-hidden="true" />
            <div className="di-story-envelope__postmark" aria-hidden="true">
              <svg viewBox="0 0 124 92">
                <path className="di-story-envelope__postmark-wave" d="M4 28h54M2 36h51M4 44h49M5 52h47M8 60h43" />
                <rect className="di-story-envelope__postmark-frame" x="66" y="11" width="49" height="70" rx="3" />
                <circle className="di-story-envelope__postmark-orbit" cx="90.5" cy="37" r="17" />
                <circle className="di-story-envelope__postmark-orbit" cx="90.5" cy="37" r="10" />
                <path className="di-story-envelope__postmark-mark" d="m90.5 22 4 11 11 4-11 4-4 11-4-11-11-4 11-4zM76 63h29M76 68h22M76 73h26" />
                <path className="di-story-envelope__postmark-scan" d="M72 16h37M72 76h37" />
              </svg>
            </div>
            <div className="di-story-envelope__flap" aria-hidden="true" onAnimationEnd={handleFlapAnimationEnd} />
            <svg className="di-story-envelope__edge-source" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true">
              <path ref={seamPathRef} d="M20 6 L980 6" />
            </svg>
          </div>
          <div className="di-story-envelope__thickness" aria-hidden="true" />
        </div>
        <svg ref={topEdgeOverlayRef} className="di-story-envelope__top-edge" viewBox="0 0 900 523" preserveAspectRatio="none" aria-hidden="true">
          <path data-top-edge-path className="di-story-envelope__top-slot" d="M20 6 L880 6" />
          <path data-top-edge-path className="di-story-envelope__top-back-lip" d="M20 1 L880 1" />
          <path data-top-edge-path className="di-story-envelope__top-guide" d="M20 8 L880 8" />
          <path data-top-edge-path className="di-story-envelope__top-front-mask" d="M20 6 L880 6" />
          <path data-top-edge-path className="di-story-envelope__top-cut" pathLength="1000" d="M20 8 L880 8" />
        </svg>
        <div className="di-story-envelope__stage-note" aria-hidden="true">A PLACE HAS BEEN HELD FOR YOU</div>
        <button
          ref={knifeRef}
          type="button"
          className={`di-story-envelope__opener${dragging ? ' is-held' : ''}`}
          aria-label={t('Pick up the letter opener and cut the seal from left to right. Press Enter, then use Arrow Right to cut by keyboard.')}
          aria-describedby="di-story-envelope-help"
          disabled={opened}
          onPointerDown={handlePointerDown}
          onPointerMove={updatePointer}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onLostPointerCapture={() => {
            pointerIdRef.current = null;
            sceneRef.current?.classList.remove('is-aligned');
            if (progressRef.current === 0 && phaseRef.current === 'knife-picked-up') transitionTo('idle');
            if (mountedRef.current) setDragging(false);
          }}
          onKeyDown={handleKeyboard}
        >
          <svg viewBox="0 0 280 48" aria-hidden="true">
            <defs>
              <linearGradient id="opener-steel" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#f2ffff" />
                <stop offset=".18" stopColor="#627d82" />
                <stop offset=".36" stopColor="#d7ebec" />
                <stop offset=".56" stopColor="#778f92" />
                <stop offset=".78" stopColor="#d1e5e5" />
                <stop offset="1" stopColor="#31484e" />
              </linearGradient>
              <linearGradient id="opener-handle" x1="0" y1="0" x2="0" y2="1">
                <stop stopColor="#d6ffff" /><stop offset=".4" stopColor="#4f8585" /><stop offset=".72" stopColor="#a4ceca" /><stop offset="1" stopColor="#34575b" />
              </linearGradient>
            </defs>
            <path className="di-opener-shadow" d="M4 24 184 14l8 4 9-11 7 2 3-6 7 7 12 1 5 6 20 4-20 5-5 7-13 1-6 9-8-7-8 3-8-4Z" />
            <path className="di-opener-blade" d="M5 24 183 17 195 21 183 29Z" fill="url(#opener-steel)" />
            <path className="di-opener-highlight" d="m13 23 165-5" />
            <path className="di-opener-guard" d="m183 17 13 4 8-13 7 2 3-6 7 7 12 1 5 6 20 6-20 5-5 7-13 1-6 9-8-7-8 3-8-4 5-9Z" fill="url(#opener-handle)" />
            <circle cx="221" cy="24" r="3.4" fill="#315458" stroke="#d9ffff" strokeWidth="1.2" />
            <circle ref={bladeTipRef} cx="5" cy="24" r="2" fill="transparent" />
          </svg>
        </button>
      </div>

      <p className="di-story-envelope__assist" id="di-story-envelope-help">{t('Keyboard: focus the letter opener, press Enter to begin, then Arrow Right until the seal is cut. Escape pauses.')}</p>
    </section>
  );
}
