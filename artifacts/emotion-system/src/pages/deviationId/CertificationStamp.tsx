import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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
      return;
    }
    if (settledRef.current) return;
    let timer: number | undefined;
    timer = window.setTimeout(() => {
      if (!mountedRef.current || settledRef.current) return;
      settledRef.current = true;
      completeRef.current();
    }, STAMP_DURATION_MS);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [active]);

  return createPortal(
    <div
      className={`di-certification-overlay${active ? ' is-active' : ''}`}
      role="status"
      aria-label={t('Temporary identity certified')}
      aria-live="assertive"
      aria-atomic="true"
      data-testid="status-certification"
    >
      <div className="di-certification-overlay__field" aria-hidden="true">
        <span className="di-certification-overlay__coordinates">ES / IDENTITY SYSTEM · 02—03</span>
        <div className="di-certification-seal">
          <span className="di-certification-seal__orbit di-certification-seal__orbit--outer" />
          <span className="di-certification-seal__orbit di-certification-seal__orbit--inner" />
          <span className="di-certification-seal__crosshair di-certification-seal__crosshair--horizontal" />
          <span className="di-certification-seal__crosshair di-certification-seal__crosshair--vertical" />
          <span className="di-certification-seal__core">
            <small>{t('TEMPORARY')}</small>
            <strong>{t('IDENTITY')}</strong>
            <i />
            <b>{t('CERTIFIED')}</b>
          </span>
        </div>
        <span className="di-certification-overlay__caption">{t('Temporary identity certified')}</span>
      </div>
    </div>,
    document.body,
  );
}
