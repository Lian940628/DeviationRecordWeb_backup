import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { AppLanguage } from '../../i18n';
import { deviationText as tx } from './copy';
import './DeviationIdNarrative.css';

export interface IdentityIssuedStageProps {
  active: boolean;
  language: AppLanguage;
  subjectId: string;
  onArrivalComplete: () => void;
  children: ReactNode;
}

export function IdentityIssuedStage({ active, language, subjectId, onArrivalComplete, children }: IdentityIssuedStageProps) {
  const t = (value: string) => tx(language, value);
  const callbackRef = useRef(onArrivalComplete);
  const completedRef = useRef(false);
  callbackRef.current = onArrivalComplete;

  useEffect(() => {
    if (!active) {
      completedRef.current = false;
      return;
    }
    if (completedRef.current) return;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const timer = window.setTimeout(() => {
      if (completedRef.current) return;
      completedRef.current = true;
      callbackRef.current();
    }, reducedMotion ? 0 : 760);
    return () => window.clearTimeout(timer);
  }, [active]);

  return (
    <section
      className={`di-story-issued${active ? ' di-story-issued--active' : ''}`}
      aria-label={t('Issued temporary identity')}
      aria-live={active ? 'polite' : undefined}
    >
      <div className="di-story-issued__topline">
        <strong>{t('IDENTITY ISSUED · TEMPORARY ACCESS')}</strong>
        <span className="di-story-issued__id">{t('SUBJECT /')} {subjectId || t('UNASSIGNED')}</span>
      </div>
      <div className="di-story-issued__content">{children}</div>
      <span className="di-story-issued__scan" aria-hidden="true" />
      <span className="di-story-issued__particles" aria-hidden="true">
        <i /><i /><i /><i />
      </span>
    </section>
  );
}
