import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { AppLanguage } from '../../i18n';
import { deviationText as tx } from './copy';
import './DeviationIdNarrative.css';

export interface InvitationEnvelopeProps {
  fileId: string;
  language: AppLanguage;
  onOpened?: () => void;
}

type SceneStyle = CSSProperties & {
  '--cut-progress': string;
  '--cut-dash-offset': string;
  '--tear-lift': string;
  '--flap-angle': string;
};

export function InvitationEnvelope({ fileId, language, onOpened }: InvitationEnvelopeProps) {
  const t = (value: string) => tx(language, value);
  const [opened, setOpened] = useState(false);
  const [dragging, setDragging] = useState(false);
  const sceneRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const envelopeRef = useRef<HTMLDivElement>(null);
  const knifeRef = useRef<HTMLButtonElement>(null);
  const bladeTipRef = useRef<SVGCircleElement>(null);
  const seamPathRef = useRef<SVGPathElement>(null);
  const pointerIdRef = useRef<number | null>(null);
  const progressRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastScratchAtRef = useRef(0);
  const openedRef = useRef(false);
  const mountedRef = useRef(false);
  const keyboardRef = useRef(false);
  const pendingPointerRef = useRef<{ x: number; y: number } | null>(null);
  const frameRef = useRef<number | null>(null);
  const grabOffsetRef = useRef({ x: 0, y: 0 });
  const knifeAngleRef = useRef(-4);
  const callbackRef = useRef(onOpened);
  const completionTimerRef = useRef<number | null>(null);
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

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      pointerIdRef.current = null;
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      if (completionTimerRef.current !== null) window.clearTimeout(completionTimerRef.current);
      if (audioContextRef.current) void audioContextRef.current.close();
    };
  }, []);

  const completeCut = useCallback(() => {
    if (openedRef.current || progressRef.current < 100) return;
    openedRef.current = true;
    setOpened(true);
    setDragging(false);
    pointerIdRef.current = null;
    keyboardRef.current = false;
    playPaperSound('confirm');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    completionTimerRef.current = window.setTimeout(() => {
      if (mountedRef.current) callbackRef.current?.();
    }, reduced ? 30 : 1850);
  }, [playPaperSound]);

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
    const tipPoint = new DOMPoint(5, 24).matrixTransform(matrix);
    const length = seam.getTotalLength();
    const start = seam.getPointAtLength(0);
    const end = seam.getPointAtLength(length);
    const screenStart = new DOMPoint(start.x, start.y).matrixTransform(seamMatrix);
    const screenEnd = new DOMPoint(end.x, end.y).matrixTransform(seamMatrix);
    const vectorX = screenEnd.x - screenStart.x;
    const vectorY = screenEnd.y - screenStart.y;
    const lengthSquared = vectorX * vectorX + vectorY * vectorY;
    const projection = ((tipPoint.x - screenStart.x) * vectorX + (tipPoint.y - screenStart.y) * vectorY) / lengthSquared;
    const clampedProjection = Math.max(0, Math.min(1, projection));
    const distance = Math.hypot(
      tipPoint.x - (screenStart.x + clampedProjection * vectorX),
      tipPoint.y - (screenStart.y + clampedProjection * vectorY),
    );
    const withinPath = projection >= 0 && projection <= 1 && distance <= 25;
    sceneRef.current?.classList.toggle('is-aligned', withinPath);
    if (!withinPath) return;

    const next = projection * 100;
    const current = progressRef.current;
    const atStart = current === 0 && next <= 5;
    if (atStart || next >= current) {
      if (next > current && Date.now() - lastScratchAtRef.current > 110) {
        lastScratchAtRef.current = Date.now();
        playPaperSound('cut');
      }
      setCutProgress(next);
    }
  }, [playPaperSound, setCutProgress]);

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
    if (grabOffset.x < bounds.width * 0.14) return;
    grabOffsetRef.current = grabOffset;
    pointerIdRef.current = event.pointerId;
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
    setDragging(false);
    event.currentTarget.classList.remove('is-held');
    sceneRef.current?.classList.remove('is-aligned');
  };

  const handleKeyboard = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (openedRef.current) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!keyboardRef.current) {
        keyboardRef.current = true;
        setDragging(true);
        sceneRef.current?.classList.add('is-cutting');
      } else {
        setCutProgress(progressRef.current + 10);
        if (progressRef.current >= 100) setDragging(false);
      }
    } else if (event.key === 'ArrowRight' && keyboardRef.current) {
      event.preventDefault();
      setCutProgress(progressRef.current + 8);
      if (progressRef.current >= 100) setDragging(false);
    } else if (event.key === 'Escape' && keyboardRef.current) {
      keyboardRef.current = false;
      setDragging(false);
      sceneRef.current?.classList.remove('is-cutting');
    }
  };

  const style: SceneStyle = {
    '--cut-progress': '0%',
    '--cut-dash-offset': '1000',
    '--tear-lift': '0px',
    '--flap-angle': '0deg',
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
      className={`di-story-envelope${opened ? ' is-opening' : ''}${dragging ? ' is-cutting' : ''}`}
      style={style}
      aria-label={t('Invitation envelope')}
      onPointerMove={handleScenePointerMove}
    >
      <div className="di-story-envelope__atmosphere" aria-hidden="true" />
      <p className="di-story-envelope__whisper">{t('The park is waiting. Your name is not yet known.')}</p>

      <div className="di-story-envelope__stage" ref={stageRef}>
        <div className="di-story-envelope__shadow" aria-hidden="true" />
        <div ref={envelopeRef} className="di-story-envelope__object">
          <div className="di-story-envelope__dossier" aria-hidden="true">
            <span>EMOTION / SYSTEM</span>
            <b>PERSONNEL RECORD</b>
            <i>ADMISSION  ·  {fileId || 'UNASSIGNED'}</i>
            <small>NAME / SELF-DEFINITION / DEVIATION</small>
          </div>
          <div className="di-story-envelope__body">
            <div className="di-story-envelope__paper-grain" />
            <div className="di-story-envelope__topline">EMOTION <i>/</i> SYSTEM <small>— EST. BETWEEN WORLDS —</small></div>
            <div className="di-story-envelope__crest" aria-hidden="true">
              <svg viewBox="0 0 52 52">
                <path d="M26 7v38M26 31C15 27 12 19 15 13c7 4 11 10 11 18M26 29c9-6 12-12 10-18-7 4-10 10-10 18M14 39h24M18 44h16" />
                <circle cx="26" cy="8" r="2" />
              </svg>
            </div>
            <div className="di-story-envelope__invitation">AN INVITATION<br /><em>to become otherwise</em></div>
            <div className="di-story-envelope__reference">APPOINTMENT OF ENTRY <span>№ {fileId || '04—B'}</span></div>
            <div className="di-story-envelope__flap" aria-hidden="true">
              <span className="di-story-envelope__tear-lift" />
            </div>
            <svg className="di-story-envelope__seam" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true">
              <path className="di-story-envelope__seam-guide" d="M105 180 L895 180" />
              <path className="di-story-envelope__cut-shadow" d="M105 180 L895 180" />
              <path ref={seamPathRef} className="di-story-envelope__cut-line" pathLength="1000" d="M105 180 L895 180" />
            </svg>
            <div className="di-story-envelope__seal" aria-hidden="true">
              <span>ES</span><small>04</small>
              <i />
            </div>
          </div>
          <div className="di-story-envelope__thickness" aria-hidden="true" />
        </div>
        <div className="di-story-envelope__stage-note" aria-hidden="true">A PLACE HAS BEEN HELD FOR YOU</div>
      </div>

      <div className="di-story-envelope__guidance" aria-live="polite">
        <span>{opened ? t('THE SEAL IS BROKEN · YOUR FILE IS WITHDRAWN') : dragging ? t('FOLLOW THE STRAIGHT SEAL · KEEP THE TIP ALIGNED') : t('PICK UP THE OPENER · ALIGN AT THE LEFT EDGE')}</span>
        <small>{t('HOLD AND DRAG · TOUCH SUPPORTED · ENTER, THEN ARROW RIGHT TO CUT')}</small>
      </div>
      <div className="di-story-envelope__meter" role="progressbar" aria-label={t('Invitation opening progress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={0}>
        <span />
      </div>
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
        <span className="di-story-envelope__pickup">PICK UP</span>
      </button>
      <p className="di-story-envelope__assist" id="di-story-envelope-help">{t('Keyboard: focus the letter opener, press Enter to begin, then Arrow Right until the seal is cut. Escape pauses.')}</p>
    </section>
  );
}
