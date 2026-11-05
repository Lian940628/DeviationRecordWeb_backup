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
  '--knife-x'?: string;
  '--knife-y'?: string;
  '--knife-angle'?: string;
};

const START = 0.105;
const END = 0.895;
const SEAM_TOLERANCE = 34;

function seamY(t: number) {
  return 0.3 + 0.075 * 3 * t * (1 - t);
}

export function InvitationEnvelope({ fileId, language, onOpened }: InvitationEnvelopeProps) {
  const t = (value: string) => tx(language, value);
  const [progress, setProgress] = useState(0);
  const [opened, setOpened] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [knife, setKnife] = useState<{ x: number; y: number; angle: number } | null>(null);
  const sceneRef = useRef<HTMLElement>(null);
  const envelopeRef = useRef<HTMLDivElement>(null);
  const knifeRef = useRef<HTMLButtonElement>(null);
  const pointerIdRef = useRef<number | null>(null);
  const progressRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastScratchAtRef = useRef(0);
  const openedRef = useRef(false);
  const mountedRef = useRef(false);
  const keyboardRef = useRef(false);
  const knifeAngleRef = useRef(-3);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const callbackRef = useRef(onOpened);
  const completionTimerRef = useRef<number | null>(null);
  callbackRef.current = onOpened;

  const playPaperSound = useCallback((kind: 'cut' | 'slide') => {
    try {
      const AudioConstructor = window.AudioContext;
      if (!AudioConstructor) return;
      const context = audioContextRef.current ?? new AudioConstructor();
      audioContextRef.current = context;
      if (context.state === 'suspended') void context.resume();
      const duration = kind === 'cut' ? 0.085 : 0.32;
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
      filter.frequency.value = kind === 'cut' ? 1450 : 720;
      filter.Q.value = kind === 'cut' ? 0.7 : 0.45;
      const now = context.currentTime;
      volume.gain.setValueAtTime(0.0001, now);
      volume.gain.exponentialRampToValueAtTime(kind === 'cut' ? 0.022 : 0.038, now + 0.025);
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
    const resize = () => {
      if (pointerIdRef.current !== null && lastPointRef.current && sceneRef.current) {
        const bounds = sceneRef.current.getBoundingClientRect();
        setKnife({
          x: Math.min(bounds.width, Math.max(0, lastPointRef.current.x - bounds.left)),
          y: Math.min(bounds.height, Math.max(0, lastPointRef.current.y - bounds.top)),
          angle: knifeAngleRef.current,
        });
      }
    };
    window.addEventListener('resize', resize);
    return () => {
      mountedRef.current = false;
      pointerIdRef.current = null;
      window.removeEventListener('resize', resize);
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
    playPaperSound('slide');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    completionTimerRef.current = window.setTimeout(() => {
      if (mountedRef.current) callbackRef.current?.();
    }, reduced ? 30 : 1850);
  }, [playPaperSound]);

  const setCutProgress = useCallback((value: number) => {
    const next = Math.max(progressRef.current, Math.min(100, value));
    progressRef.current = next;
    setProgress(next);
    if (next >= 100) completeCut();
  }, [completeCut]);

  const updatePointer = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (pointerIdRef.current !== event.pointerId || openedRef.current || !sceneRef.current || !envelopeRef.current) return;
    const scene = sceneRef.current.getBoundingClientRect();
    const envelope = envelopeRef.current.getBoundingClientRect();
    const x = event.clientX - scene.left;
    const y = event.clientY - scene.top;
    const envelopeX = (event.clientX - envelope.left) / envelope.width;
    const envelopeY = (event.clientY - envelope.top) / envelope.height;
    const angle = lastPointRef.current
      ? Math.max(-13, Math.min(11, Math.atan2(event.clientY - lastPointRef.current.y, event.clientX - lastPointRef.current.x) * 30))
      : -3;
    knifeAngleRef.current = angle;
    lastPointRef.current = { x: event.clientX, y: event.clientY };
    setKnife({ x, y, angle });

    const tOnSeam = (envelopeX - START) / (END - START);
    const distance = Math.abs(envelopeY - seamY(Math.max(0, Math.min(1, tOnSeam)))) * envelope.height;
    const onPath = tOnSeam >= 0 && tOnSeam <= 1 && distance <= SEAM_TOLERANCE;
    if (!onPath) return;
    const next = tOnSeam * 100;
    const current = progressRef.current;
    const startedAtSeamStart = current === 0 && next <= 7;
    const continuous = next >= current - 1 && next - current <= 14;
    if (startedAtSeamStart || continuous) {
      if (next > progressRef.current && Date.now() - lastScratchAtRef.current > 110) {
        lastScratchAtRef.current = Date.now();
        playPaperSound('cut');
      }
      setCutProgress(next);
    }
  }, [playPaperSound, setCutProgress]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (openedRef.current) return;
    event.preventDefault();
    pointerIdRef.current = event.pointerId;
    lastPointRef.current = { x: event.clientX, y: event.clientY };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    updatePointer(event);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    updatePointer(event);
    pointerIdRef.current = null;
    setDragging(false);
  };

  const handleKeyboard = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (openedRef.current) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!keyboardRef.current) {
        keyboardRef.current = true;
        setDragging(true);
      } else {
        setCutProgress(Math.min(100, progressRef.current + 12));
        if (progressRef.current >= 100) setDragging(false);
      }
    } else if (event.key === 'ArrowRight' && keyboardRef.current) {
      event.preventDefault();
      setCutProgress(Math.min(100, progressRef.current + 12));
      if (progressRef.current >= 100) setDragging(false);
    } else if (event.key === 'Escape' && keyboardRef.current) {
      keyboardRef.current = false;
      setDragging(false);
    }
  };

  const style: SceneStyle = {
    '--cut-progress': `${progress}%`,
    '--cut-dash-offset': `${1000 - progress * 10}`,
    ...(knife ? {
      '--knife-x': `${knife.x}px`,
      '--knife-y': `${knife.y}px`,
      '--knife-angle': `${knife.angle}deg`,
    } : {}),
  };

  return (
    <section
      ref={sceneRef}
      className={`di-story-envelope${opened ? ' is-opening' : ''}${dragging ? ' is-cutting' : ''}`}
      style={style}
      aria-label={t('Invitation envelope')}
    >
      <div className="di-story-envelope__atmosphere" aria-hidden="true" />
      <header className="di-story-envelope__masthead">
        <span className="di-story-envelope__edition">A PRIVATE ADMISSION</span>
        <strong>EMOTION <i>/</i> SYSTEM</strong>
        <span className="di-story-envelope__edition">GATE 04 · AFTER DUSK</span>
      </header>
      <p className="di-story-envelope__whisper">{t('The park is waiting. Your name is not yet known.')}</p>

      <div className="di-story-envelope__stage">
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
            <div className="di-story-envelope__flap" aria-hidden="true" />
            <svg className="di-story-envelope__seam" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true">
              <path className="di-story-envelope__seam-guide" d="M105 180 C290 225 710 225 895 180" />
              <path className="di-story-envelope__cut-shadow" d="M105 180 C290 225 710 225 895 180" />
              <path className="di-story-envelope__cut-line" pathLength="1000" d="M105 180 C290 225 710 225 895 180" />
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
        <span>{opened ? t('THE SEAL IS BROKEN · YOUR FILE IS WITHDRAWN') : dragging ? t('FOLLOW THE CURVE · KEEP THE TIP ON THE PAPER') : t('LIFT THE OPENER · BEGIN AT THE LEFT EDGE')}</span>
        <small>{t('DRAG WITH POINTER OR TOUCH · FOCUS THE OPENER, THEN PRESS ENTER / ARROW')}</small>
      </div>
      <div className="di-story-envelope__meter" role="progressbar" aria-label={t('Invitation opening progress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={opened ? 100 : Math.round(progress)}>
        <span />
      </div>
      <button
        ref={knifeRef}
        type="button"
        className={`di-story-envelope__opener${knife ? ' is-held' : ''}`}
        style={knife ? { left: knife.x, top: knife.y, transform: `translate(-4px, -50%) rotate(${knife.angle}deg)` } : undefined}
        aria-label={t('Pick up the letter opener and cut the seal from left to right. Press Enter, then use Arrow Right to cut by keyboard.')}
        aria-describedby="di-story-envelope-help"
        disabled={opened}
        onPointerDown={handlePointerDown}
        onPointerMove={updatePointer}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onLostPointerCapture={() => {
          pointerIdRef.current = null;
          if (mountedRef.current) setDragging(false);
        }}
        onKeyDown={handleKeyboard}
      >
        <svg viewBox="0 0 280 48" aria-hidden="true">
          <defs>
            <linearGradient id="opener-steel" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#f4e1b0" />
              <stop offset=".18" stopColor="#7c6950" />
              <stop offset=".36" stopColor="#e7ddc4" />
              <stop offset=".56" stopColor="#867a66" />
              <stop offset=".78" stopColor="#d6c6a3" />
              <stop offset="1" stopColor="#4b4034" />
            </linearGradient>
            <linearGradient id="opener-brass" x1="0" y1="0" x2="0" y2="1">
              <stop stopColor="#e5c77e" /><stop offset=".45" stopColor="#71502e" /><stop offset=".7" stopColor="#c7a45d" /><stop offset="1" stopColor="#493622" />
            </linearGradient>
          </defs>
          <path className="di-opener-shadow" d="M4 24 184 14l8 4 9-11 7 2 3-6 7 7 12 1 5 6 20 4-20 5-5 7-13 1-6 9-8-7-8 3-8-4Z" />
          <path className="di-opener-blade" d="M5 24 183 17 195 21 183 29Z" fill="url(#opener-steel)" />
          <path className="di-opener-highlight" d="m13 23 165-5" />
          <path className="di-opener-guard" d="m183 17 13 4 8-13 7 2 3-6 7 7 12 1 5 6 20 6-20 5-5 7-13 1-6 9-8-7-8 3-8-4 5-9Z" fill="url(#opener-brass)" />
          <circle cx="221" cy="24" r="3.4" fill="#493923" stroke="#d9c07f" strokeWidth="1.2" />
        </svg>
        <span className="di-story-envelope__pickup">PICK UP</span>
      </button>
      <p className="di-story-envelope__assist" id="di-story-envelope-help">{t('Keyboard: focus the letter opener, press Enter to begin, then Arrow Right until the seal is cut. Escape pauses.')}</p>

      <div className="di-story-envelope__transition-sheet" aria-hidden="true">
        <span>EMOTION / SYSTEM</span>
        <b>PERSONNEL RECORD</b>
        <i>FILE {fileId || '04—B'}</i>
      </div>
    </section>
  );
}
