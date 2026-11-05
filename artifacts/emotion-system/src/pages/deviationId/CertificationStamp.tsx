import { useEffect, useRef, useState } from 'react';
import type { AppLanguage } from '../../i18n';
import { deviationText as tx } from './copy';
import './DeviationIdNarrative.css';

export interface CertificationStampProps {
  active: boolean;
  language: AppLanguage;
  onComplete: () => void;
}

const STAMP_DURATION_MS = 820;

export function CertificationStamp({ active, language, onComplete }: CertificationStampProps) {
  const [settled, setSettled] = useState(false);
  const t = (value: string) => tx(language, value);
  const completeRef = useRef(onComplete);
  const settledRef = useRef(false);
  const mountedRef = useRef(false);
  completeRef.current = onComplete;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!active) {
      settledRef.current = false;
      setSettled(false);
      return;
    }
    if (settledRef.current) return;
    let timer: number | undefined;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    timer = window.setTimeout(() => {
      if (!mountedRef.current || settledRef.current) return;
      settledRef.current = true;
      setSettled(true);
      completeRef.current();
    }, reducedMotion ? 0 : STAMP_DURATION_MS);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [active]);

  return (
    <div
      className={`di-story-stamp${active ? ' di-story-stamp--active' : ''}`}
      role="img"
      aria-label={t(settled ? 'Temporary identity certified' : active ? 'Certifying temporary identity' : 'Certification stamp ready')}
      aria-live="polite"
    >
      <div className="di-story-stamp__mark">
        <span>{t('TEMPORARY')}<small>{t('IDENTITY')}</small></span>
      </div>
      <span className="di-story-stamp__label">{t(settled ? 'CERTIFIED' : active ? 'VERIFYING' : 'PENDING')}</span>
    </div>
  );
}
