import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { Scissors } from 'lucide-react';
import type { AppLanguage } from '../../i18n';
import { deviationText as tx } from './copy';
import './DeviationIdNarrative.css';

export interface InvitationEnvelopeProps {
  fileId: string;
  language: AppLanguage;
  onOpened: () => void;
}

const OPEN_THRESHOLD = 100;
type NarrativeCSSProperties = CSSProperties & { '--di-story-progress': string };

export function InvitationEnvelope({ fileId, language, onOpened }: InvitationEnvelopeProps) {
  const t = (value: string) => tx(language, value);
  const [progress, setProgress] = useState(0);
  const [opened, setOpened] = useState(false);
  const [dragging, setDragging] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);
  const pointerIdRef = useRef<number | null>(null);
  const openedRef = useRef(false);
  const mountedRef = useRef(false);
  const callbackRef = useRef(onOpened);
  callbackRef.current = typeof onOpened === 'function' ? onOpened : () => {};

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      pointerIdRef.current = null;
    };
  }, []);

  useEffect(() => {
    openedRef.current = false;
    setOpened(false);
    setProgress(0);
    setDragging(false);
    pointerIdRef.current = null;
  }, [fileId]);

  const finishOpening = useCallback(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    setProgress(OPEN_THRESHOLD);
    setOpened(true);
    setDragging(false);
    pointerIdRef.current = null;
    if (mountedRef.current && typeof callbackRef.current === 'function') callbackRef.current();
  }, []);

  const updateFromPointer = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (pointerIdRef.current !== event.pointerId || !railRef.current || openedRef.current) return;
    const bounds = railRef.current.getBoundingClientRect();
    const nextProgress = bounds.width > 0
      ? Math.max(0, Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100))
      : 0;
    setProgress(nextProgress);
    if (nextProgress >= OPEN_THRESHOLD - 1) finishOpening();
  }, [finishOpening]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (openedRef.current) return;
    event.preventDefault();
    pointerIdRef.current = event.pointerId;
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    updateFromPointer(event);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    updateFromPointer(event);
    pointerIdRef.current = null;
    setDragging(false);
  };

  const status = opened
    ? 'ENVELOPE OPENED · ACCESS GRANTED'
    : progress > 0
      ? t('CUTTING THE SEAL…')
      : t('SEALED · AWAITING YOUR HAND');

  return (
    <section className="di-story-envelope" aria-label={t('Invitation envelope')}>
      <div className="di-story-envelope__masthead">
        <strong>EMOTION / SYSTEM</strong>
        <span>{t('MAILROOM 04—B')}</span>
      </div>
      <div className="di-story-envelope__paper" aria-hidden="true">
        <span className="di-story-envelope__seal">ES—04</span>
        <h2 className="di-story-envelope__title">{t('A place has been held for you.')}</h2>
        <span className="di-story-envelope__file">DOSSIER · {fileId || 'UNNUMBERED'}</span>
      </div>
      <div
        ref={railRef}
        className="di-story-envelope__rail"
        style={{ '--di-story-progress': `${progress}%` } as NarrativeCSSProperties}
      >
        <button
          type="button"
          className="di-story-envelope__cutter"
          aria-label={t('Drag paper cutter from left to right to open invitation')}
          aria-disabled={opened}
          disabled={opened}
          onPointerDown={handlePointerDown}
          onPointerMove={updateFromPointer}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onLostPointerCapture={() => {
            pointerIdRef.current = null;
            if (mountedRef.current) setDragging(false);
          }}
        >
          <Scissors aria-hidden="true" />
        </button>
      </div>
      <p className="di-story-envelope__instructions" id="di-story-envelope-instructions">
        <span>{t(dragging ? 'KEEP MOVING RIGHT TO BREAK THE SEAL' : 'DRAG THE CUTTER ACROSS THE SEAL')}</span>
        <span>{t('OR USE OPEN INVITATION BELOW')}</span>
      </p>
      <div
        className="di-story-envelope__progress"
        role="progressbar"
        aria-label={t('Invitation opening progress')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={opened ? 100 : Math.round(progress)}
      >
        <span style={{ '--di-story-progress': `${opened ? 100 : progress}%` } as NarrativeCSSProperties} />
      </div>
      <div className="di-story-envelope__actions">
        <span className="di-story-envelope__status" role="status" aria-live="polite">{opened ? t('ENVELOPE OPENED · ACCESS GRANTED') : status}</span>
        <button
          type="button"
          className="di-story-envelope__open"
          onClick={finishOpening}
          disabled={opened}
          aria-describedby="di-story-envelope-instructions"
        >
          {t(opened ? 'INVITATION OPENED' : 'OPEN INVITATION')}
        </button>
      </div>
      <div className="di-story-envelope__footer">
        <span>{t('PERSONNEL FILE ·')} {fileId || t('PENDING')}</span>
        <span>{t('ISSUED TEMPORARILY')}</span>
      </div>
    </section>
  );
}
