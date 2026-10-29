import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Link } from 'wouter';
import type { AppLanguage } from '../i18n';
import bodyScanReference from '../dashboard/body-scan-reference.png';
import './interactiveLanding.css';

type InteractiveLandingProps = {
  header?: ReactNode;
  language?: AppLanguage;
};

type Signal = {
  id: number;
  x: number;
  y: number;
};

const PARTICLES = [
  { x: 19, y: 18, size: 2, opacity: .38 },
  { x: 36, y: 29, size: 2, opacity: .66 },
  { x: 72, y: 16, size: 1, opacity: .55 },
  { x: 85, y: 34, size: 2, opacity: .42 },
  { x: 61, y: 55, size: 2, opacity: .58 },
  { x: 27, y: 69, size: 1, opacity: .45 },
  { x: 78, y: 79, size: 2, opacity: .5 },
  { x: 47, y: 87, size: 1, opacity: .6 },
  { x: 93, y: 61, size: 1, opacity: .4 },
  { x: 11, y: 47, size: 2, opacity: .48 },
  { x: 54, y: 11, size: 1, opacity: .5 },
  { x: 40, y: 72, size: 2, opacity: .37 },
];

const COPY = {
  zh: [
    '我們生活在極度精準的系統中,但每個人內在卻總帶有一點點錯位——記憶偏差、感知誤差、情緒雜訊。',
    '作為我們四年來的結晶,這場展覽不是完美的作品輸出,而是每個人偏差訊號的拼貼,一場屬於數位時代的情感樂園。',
    '在走向畢業、踏入未知的這一刻,選擇用不確定的語言,回應不確定的未來。',
  ],
  en: [
    'We live inside systems of extreme precision, yet each of us carries a slight misalignment: memory drift, perceptual error, emotional noise.',
    'The culmination of four years, this exhibition is not a perfect output, but a collage of our deviation signals—a feeling-space for the digital age.',
    'At the threshold of graduation and the unknown, we choose an uncertain language to answer an uncertain future.',
  ],
} as const;

export default function InteractiveLanding({ header, language = 'en' }: InteractiveLandingProps) {
  const nextSignalId = useRef(0);
  const signalTimeouts = useRef<number[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [pointerEnabled, setPointerEnabled] = useState(false);
  const [motionAllowed, setMotionAllowed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const touchFirst = window.matchMedia('(hover: none), (pointer: coarse)');
    const update = () => {
      setReducedMotion(reduced.matches);
      setMotionAllowed(!reduced.matches && !touchFirst.matches);
    };
    update();
    reduced.addEventListener?.('change', update);
    touchFirst.addEventListener?.('change', update);
    return () => {
      reduced.removeEventListener?.('change', update);
      touchFirst.removeEventListener?.('change', update);
      signalTimeouts.current.forEach(window.clearTimeout);
    };
  }, []);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!motionAllowed || (event.pointerType !== 'mouse' && event.pointerType !== 'pen')) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;
    const field = event.currentTarget.querySelector<HTMLElement>('.ir-landing__field');
    if (field) {
      field.style.setProperty('--ir-x', `${Math.round(x * 100)}%`);
      field.style.setProperty('--ir-y', `${Math.round(y * 100)}%`);
      field.style.setProperty('--ir-parallax-x', `${((x - .5) * 26).toFixed(1)}px`);
      field.style.setProperty('--ir-parallax-y', `${((y - .5) * 18).toFixed(1)}px`);
    }
    setPointerEnabled(true);
    const particles = event.currentTarget.querySelectorAll<HTMLElement>('.ir-landing__particle');
    particles.forEach((particle, index) => {
      const strength = 8 + (index % 4) * 2;
      const dx = (x - .5) * strength * ((index % 3) + 1);
      const dy = (y - .5) * strength * (((index + 1) % 3) + 1);
      particle.style.setProperty('--drift-x', `${dx.toFixed(1)}px`);
      particle.style.setProperty('--drift-y', `${dy.toFixed(1)}px`);
    });
  }, [motionAllowed]);

  const handlePointerLeave = useCallback(() => setPointerEnabled(false), []);

  const handleClick = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (reducedMotion || event.button !== 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const id = ++nextSignalId.current;
    const signal = {
      id,
      x: ((event.clientX - bounds.left) / bounds.width) * 100,
      y: ((event.clientY - bounds.top) / bounds.height) * 100,
    };
    setSignals((current) => [...current.slice(-2), signal]);
    const timeout = window.setTimeout(() => {
      setSignals((current) => current.filter((item) => item.id !== id));
      signalTimeouts.current = signalTimeouts.current.filter((value) => value !== timeout);
    }, 850);
    signalTimeouts.current.push(timeout);
  }, [reducedMotion]);

  const paragraphs = COPY[language];
  const pointerClass = pointerEnabled ? ' is-pointer-active' : '';

  return (
    <main
      className={`ir-landing${pointerClass}${signals.length ? ' is-signaling' : ''}`}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onPointerDown={handleClick}
    >
      {header ? <div className="ir-landing__header">{header}</div> : null}
      <section className="ir-landing__stage" aria-labelledby="ir-landing-title">
        <div className="ir-landing__field" aria-hidden="true">
          <div className="ir-landing__body-art">
            <img src={bodyScanReference} alt="" />
          </div>
          <div className="ir-landing__orbit" />
          {PARTICLES.map((particle, index) => (
            <span
              className="ir-landing__particle"
              key={index}
              style={{
                '--particle-x': `${particle.x}%`,
                '--particle-y': `${particle.y}%`,
                '--particle-size': `${particle.size}px`,
                '--particle-opacity': particle.opacity,
                '--particle-color': index % 4 === 0 ? '#e2a18b' : '#8cfff0',
              } as CSSProperties}
            />
          ))}
        </div>
        {signals.map((signal) => (
          <span
            className="ir-landing__signal"
            key={signal.id}
            aria-hidden="true"
            style={{ '--signal-x': `${signal.x}%`, '--signal-y': `${signal.y}%` } as CSSProperties}
          />
        ))}
        <div className="ir-landing__content">
          <h1 className="ir-landing__title" id="ir-landing-title">
            Deviation <span>Record</span>
          </h1>
          <div className="ir-landing__text" lang={language === 'zh' ? 'zh-TW' : 'en'}>
            {paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </div>
          <Link className="ir-landing__action" href="/experience" data-testid="link-start-experience">
            <span>{language === 'zh' ? '開始體驗' : 'START EXPERIENCE'}</span>
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M4.25 15.75 15.5 4.5M6 4.5h9.5V14" stroke="currentColor" strokeWidth="1.35" />
            </svg>
          </Link>
        </div>
        <div className="ir-landing__edge-mark" aria-hidden="true" />
      </section>
      <footer className="ir-landing__footer" aria-hidden="true"><span /></footer>
    </main>
  );
}
