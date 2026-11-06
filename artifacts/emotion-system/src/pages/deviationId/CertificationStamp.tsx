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
        <div className="di-certification-seal">
          <svg className="di-certification-seal__engraving" viewBox="0 0 600 600">
            <defs>
              <path id="di-certification-top-arc" d="M 82 300 A 218 218 0 0 1 518 300" />
              <path id="di-certification-bottom-arc" d="M 82 300 A 218 218 0 0 0 518 300" />
            </defs>
            <circle className="di-certification-seal__track di-certification-seal__track--outer" cx="300" cy="300" r="258" />
            <circle className="di-certification-seal__track di-certification-seal__track--bright" cx="300" cy="300" r="235" />
            <circle className="di-certification-seal__track di-certification-seal__track--inner" cx="300" cy="300" r="180" />
            <circle className="di-certification-seal__ticks" cx="300" cy="300" r="218" />
            <text className="di-certification-seal__curve">
              <textPath href="#di-certification-top-arc" startOffset="50%" textAnchor="middle">CERTIFICATION</textPath>
            </text>
            <text className="di-certification-seal__curve di-certification-seal__curve--lower">
              <textPath href="#di-certification-bottom-arc" startOffset="50%" textAnchor="middle">C E R T I F I C A T I O N</textPath>
            </text>
            <path className="di-certification-seal__axis" d="M300 0v95 M300 505v95 M0 300h73 M527 300h73" />
            <path className="di-certification-seal__calibration" d="M300 89v28 M300 483v28 M89 300h28 M483 300h28" />
          </svg>
          <span className="di-certification-seal__cross di-certification-seal__cross--left">+</span>
          <span className="di-certification-seal__cross di-certification-seal__cross--right">+</span>
          <div className="di-certification-seal__banner">
            <span>CERTIFICATION</span>
          </div>
          <div className="di-certification-seal__barcode">
            {Array.from({ length: 18 }, (_, index) => <i key={index} />)}
          </div>
          <div className="di-certification-seal__spark di-certification-seal__spark--one" />
          <div className="di-certification-seal__spark di-certification-seal__spark--two" />
        </div>
      </div>
    </div>,
    document.body,
  );
}
