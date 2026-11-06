import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Link } from 'wouter';
import type { AppLanguage } from '../i18n';
import bannerImage from '../dashboard/deviation-record-banner.webp';
import FuzzyText from './ui/FuzzyText';
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

type CodeTrace = {
  id: number;
  x: number;
  y: number;
  text: string;
};

type FuzzyTitleMetrics = {
  fontSize: number;
  fontWeight: string;
  fontFamily: string;
  letterSpacingPrimary: number;
  letterSpacingSecondary: number;
  colorPrimary: string;
  colorSecondary: string;
  primaryLeft: number;
  secondaryLeft: number;
  top: number;
  textTransform: string;
};

const CODE_SNIPPETS = ['0xDEVIATION', 'if (signal)', 'drift += 0.018', 'mem://offset', 'while (seen)', 'Δ perception', 'return noise'];

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
  ],
  en: [
    'We live inside systems of extreme precision, yet each of us carries a slight misalignment: memory drift, perceptual error, emotional noise.',
  ],
} as const;

export default function InteractiveLanding({ header, language = 'en' }: InteractiveLandingProps) {
  const nextSignalId = useRef(0);
  const nextTraceId = useRef(0);
  const previousPointer = useRef<{ x: number; y: number } | null>(null);
  const signalTimeouts = useRef<number[]>([]);
  const traceTimeouts = useRef<number[]>([]);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleSecondaryRef = useRef<HTMLSpanElement>(null);
  const fuzzyLayerRef = useRef<HTMLSpanElement>(null);
  const fuzzyPointerFrame = useRef(0);
  const fuzzyPointerPosition = useRef<{ x: number; y: number; pointerType: string; pointerId: number } | null>(null);
  const fuzzyHoverRef = useRef(false);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [codeTrail, setCodeTrail] = useState<CodeTrace[]>([]);
  const [pointerEnabled, setPointerEnabled] = useState(false);
  const [motionAllowed, setMotionAllowed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [fuzzyMetrics, setFuzzyMetrics] = useState<FuzzyTitleMetrics | null>(null);
  const [fuzzyIntroActive, setFuzzyIntroActive] = useState(false);
  const [fuzzyHoverActive, setFuzzyHoverActive] = useState(false);

  const dispatchFuzzyPointer = useCallback((
    eventType: 'pointermove' | 'pointerleave',
    point: { x: number; y: number; pointerType: string; pointerId: number },
  ) => {
    const canvases = fuzzyLayerRef.current?.querySelectorAll('canvas');
    if (!canvases?.length) return;
    canvases.forEach((canvas) => {
      const forwarded = typeof PointerEvent !== 'undefined'
        ? new PointerEvent(eventType, {
            clientX: point.x,
            clientY: point.y,
            pointerType: point.pointerType,
            pointerId: point.pointerId,
            isPrimary: true,
          })
        : new MouseEvent(eventType, { clientX: point.x, clientY: point.y });
      canvas.dispatchEvent(forwarded);
    });
  }, []);

  useEffect(() => {
    if (!motionAllowed || reducedMotion) {
      setFuzzyMetrics(null);
      setFuzzyIntroActive(false);
      setFuzzyHoverActive(false);
      fuzzyHoverRef.current = false;
      return;
    }

    const title = titleRef.current;
    const secondary = titleSecondaryRef.current;
    const textNode = title?.firstChild;
    if (!title || !secondary || !textNode || textNode.nodeType !== Node.TEXT_NODE) return;

    let cancelled = false;
    let introTimer = 0;
    let measureFrame = 0;
    let fontReady = false;
    const fontStyle = window.getComputedStyle(title);
    const initialFontSize = Number.parseFloat(fontStyle.fontSize);
    const fontDescriptor = `${fontStyle.fontWeight} ${initialFontSize}px "Azonix"`;
    let resizeObserver: ResizeObserver | undefined;

    const updateMetrics = () => {
      if (cancelled || !fontReady) return;
      const currentTitle = titleRef.current;
      const currentSecondary = titleSecondaryRef.current;
      const currentTextNode = currentTitle?.firstChild;
      if (!currentTitle || !currentSecondary || !currentTextNode || currentTextNode.nodeType !== Node.TEXT_NODE) return;

      const primaryRange = document.createRange();
      primaryRange.setStart(currentTextNode, 0);
      primaryRange.setEnd(currentTextNode, currentTextNode.textContent?.length ?? 0);
      const primaryRect = primaryRange.getBoundingClientRect();
      const secondaryRange = document.createRange();
      secondaryRange.selectNodeContents(currentSecondary);
      const secondaryRect = secondaryRange.getBoundingClientRect();
      const titleRect = currentTitle.getBoundingClientRect();
      const titleStyle = window.getComputedStyle(currentTitle);
      const secondaryStyle = window.getComputedStyle(currentSecondary);
      const fontSize = Number.parseFloat(titleStyle.fontSize);
      const parsedLineHeight = Number.parseFloat(titleStyle.lineHeight);
      const lineHeight = Number.isFinite(parsedLineHeight) ? parsedLineHeight : fontSize * 1.1;
      const primaryLetterSpacing = Number.parseFloat(titleStyle.letterSpacing);
      const secondaryLetterSpacing = Number.parseFloat(secondaryStyle.letterSpacing);

      // React Bits reserves fuzzRange + 20px + 5px inset on the left for horizontal slices.
      const canvasInkPadding = 30 + 20 + 5;
      setFuzzyMetrics({
        fontSize,
        fontWeight: titleStyle.fontWeight,
        fontFamily: titleStyle.fontFamily,
        letterSpacingPrimary: Number.isFinite(primaryLetterSpacing) ? primaryLetterSpacing : 0,
        letterSpacingSecondary: Number.isFinite(secondaryLetterSpacing) ? secondaryLetterSpacing : 0,
        colorPrimary: titleStyle.color,
        colorSecondary: secondaryStyle.color,
        primaryLeft: primaryRect.left - titleRect.left - canvasInkPadding,
        secondaryLeft: secondaryRect.left - titleRect.left - canvasInkPadding,
        top: primaryRect.top - titleRect.top + Math.max(0, (lineHeight - fontSize) / 2),
        textTransform: titleStyle.textTransform,
      });
    };

    const scheduleMeasure = () => {
      window.cancelAnimationFrame(measureFrame);
      measureFrame = window.requestAnimationFrame(updateMetrics);
    };

    const initialize = async () => {
      try {
        await document.fonts.load(fontDescriptor, 'DeviationRecord');
        await document.fonts.ready;
      } catch {
        return;
      }
      if (cancelled || !document.fonts.check(fontDescriptor, 'DeviationRecord')) return;

      fontReady = true;
      updateMetrics();
      setFuzzyIntroActive(true);
      introTimer = window.setTimeout(() => setFuzzyIntroActive(false), 1400);
      resizeObserver = new ResizeObserver(scheduleMeasure);
      resizeObserver.observe(title);
      window.addEventListener('resize', scheduleMeasure);
    };

    void initialize();
    return () => {
      cancelled = true;
      window.clearTimeout(introTimer);
      window.cancelAnimationFrame(measureFrame);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
      if (fuzzyPointerFrame.current) window.cancelAnimationFrame(fuzzyPointerFrame.current);
    };
  }, [motionAllowed, reducedMotion]);

  const handleFuzzyTitlePointerMove = useCallback((event: ReactPointerEvent<HTMLHeadingElement>) => {
    if (!motionAllowed || reducedMotion || !fuzzyMetrics || (event.pointerType !== 'mouse' && event.pointerType !== 'pen')) return;
    const title = titleRef.current;
    const secondary = titleSecondaryRef.current;
    const textNode = title?.firstChild;
    if (!title || !secondary || !textNode || textNode.nodeType !== Node.TEXT_NODE) return;

    const primaryRange = document.createRange();
    primaryRange.setStart(textNode, 0);
    primaryRange.setEnd(textNode, textNode.textContent?.length ?? 0);
    const primaryRect = primaryRange.getBoundingClientRect();
    const secondaryRange = document.createRange();
    secondaryRange.selectNodeContents(secondary);
    const secondaryRect = secondaryRange.getBoundingClientRect();
    const overText = [primaryRect, secondaryRect].some((rect) =>
      event.clientX >= rect.left && event.clientX <= rect.right &&
      event.clientY >= rect.top && event.clientY <= rect.bottom,
    );

    if (!overText) {
      if (fuzzyHoverRef.current) {
        fuzzyHoverRef.current = false;
        setFuzzyHoverActive(false);
        dispatchFuzzyPointer('pointerleave', {
          x: event.clientX,
          y: event.clientY,
          pointerType: event.pointerType,
          pointerId: event.pointerId,
        });
      }
      return;
    }

    if (!fuzzyHoverRef.current) {
      fuzzyHoverRef.current = true;
      setFuzzyHoverActive(true);
    }
    fuzzyPointerPosition.current = {
      x: event.clientX,
      y: event.clientY,
      pointerType: event.pointerType,
      pointerId: event.pointerId,
    };
    if (!fuzzyPointerFrame.current) {
      fuzzyPointerFrame.current = window.requestAnimationFrame(() => {
        fuzzyPointerFrame.current = 0;
        const point = fuzzyPointerPosition.current;
        if (point) dispatchFuzzyPointer('pointermove', point);
      });
    }
  }, [dispatchFuzzyPointer, fuzzyMetrics, motionAllowed, reducedMotion]);

  const handleFuzzyTitlePointerLeave = useCallback((event: ReactPointerEvent<HTMLHeadingElement>) => {
    if (!fuzzyHoverRef.current) return;
    fuzzyHoverRef.current = false;
    setFuzzyHoverActive(false);
    dispatchFuzzyPointer('pointerleave', {
      x: event.clientX,
      y: event.clientY,
      pointerType: event.pointerType,
      pointerId: event.pointerId,
    });
  }, [dispatchFuzzyPointer]);

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
      traceTimeouts.current.forEach(window.clearTimeout);
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
    const prior = previousPointer.current;
    if (!reducedMotion && prior && Math.hypot(event.clientX - prior.x, event.clientY - prior.y) > 34) {
      const id = ++nextTraceId.current;
      const stage = event.currentTarget.querySelector('.ir-landing__stage');
      const stageBounds = stage?.getBoundingClientRect() ?? bounds;
      const trace = {
        id,
        x: prior.x - stageBounds.left,
        y: prior.y - stageBounds.top,
        text: CODE_SNIPPETS[(id - 1) % CODE_SNIPPETS.length],
      };
      setCodeTrail((current) => [...current.slice(-6), trace]);
      const timeout = window.setTimeout(() => {
        setCodeTrail((current) => current.filter((item) => item.id !== id));
        traceTimeouts.current = traceTimeouts.current.filter((value) => value !== timeout);
      }, 720);
      traceTimeouts.current.push(timeout);
    }
    previousPointer.current = { x: event.clientX, y: event.clientY };
    setPointerEnabled(true);
    const particles = event.currentTarget.querySelectorAll<HTMLElement>('.ir-landing__particle');
    particles.forEach((particle, index) => {
      const strength = 8 + (index % 4) * 2;
      const dx = (x - .5) * strength * ((index % 3) + 1);
      const dy = (y - .5) * strength * (((index + 1) % 3) + 1);
      particle.style.setProperty('--drift-x', `${dx.toFixed(1)}px`);
      particle.style.setProperty('--drift-y', `${dy.toFixed(1)}px`);
    });
  }, [motionAllowed, reducedMotion]);

  const handlePointerLeave = useCallback(() => {
    previousPointer.current = null;
    setPointerEnabled(false);
  }, []);

  const handleClick = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (reducedMotion || event.button !== 0 || event.pointerType === 'touch') return;
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
          <img className="ir-landing__banner" src={bannerImage} alt="" />
          <div className="ir-landing__banner-shade" />
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
                 '--particle-color': index % 4 === 0 ? '#65f4dc' : '#24d9e8',
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
        <div className="ir-landing__code-trail" aria-hidden="true">
          {codeTrail.map((trace) => (
            <span key={trace.id} className="ir-landing__code-fragment" style={{ left: trace.x, top: trace.y }}>
              {trace.text}
            </span>
          ))}
        </div>
        <div className="ir-landing__content">
          <h1
            ref={titleRef}
            className={`ir-landing__title${fuzzyIntroActive ? ' is-fuzzy-intro' : ''}`}
            id="ir-landing-title"
            data-testid="text-home-title"
            onPointerMove={handleFuzzyTitlePointerMove}
            onPointerLeave={handleFuzzyTitlePointerLeave}
          >
            Deviation<span ref={titleSecondaryRef} className="ir-landing__title-secondary">Record</span>
            {fuzzyMetrics ? (
              <span
                ref={fuzzyLayerRef}
                className={`ir-landing__fuzzy-layer${fuzzyIntroActive || fuzzyHoverActive ? ' is-visible' : ''}`}
                aria-hidden="true"
                style={{
                  '--ir-fuzzy-primary-left': `${fuzzyMetrics.primaryLeft}px`,
                  '--ir-fuzzy-secondary-left': `${fuzzyMetrics.secondaryLeft}px`,
                  '--ir-fuzzy-top': `${fuzzyMetrics.top}px`,
                } as CSSProperties}
              >
                <FuzzyText
                  fontFamily={fuzzyMetrics.fontFamily}
                  fontSize={fuzzyMetrics.fontSize}
                  fontWeight={fuzzyMetrics.fontWeight}
                  color={fuzzyMetrics.colorPrimary}
                  colorSplit={0}
                  trigger="hover"
                  direction="horizontal"
                  baseIntensity={0.06}
                  hoverIntensity={0.58}
                  fuzzRange={30}
                  sliceSize={1}
                  fps={60}
                  transitionDuration={14}
                  intro
                  introDuration={1400}
                  letterSpacing={fuzzyMetrics.letterSpacingPrimary}
                  enableHover
                  clickEffect={false}
                  glitchMode={false}
                  glitchInterval={2000}
                  glitchDuration={200}
                  className="ir-landing__fuzzy-canvas ir-landing__fuzzy-canvas--primary"
                >
                  {fuzzyMetrics.textTransform === 'uppercase' ? 'DEVIATION' : 'Deviation'}
                </FuzzyText>
                <FuzzyText
                  fontFamily={fuzzyMetrics.fontFamily}
                  fontSize={fuzzyMetrics.fontSize}
                  fontWeight={fuzzyMetrics.fontWeight}
                  color={fuzzyMetrics.colorSecondary}
                  colorSplit={0}
                  trigger="hover"
                  direction="horizontal"
                  baseIntensity={0.06}
                  hoverIntensity={0.58}
                  fuzzRange={30}
                  sliceSize={1}
                  fps={60}
                  transitionDuration={14}
                  intro
                  introDuration={1400}
                  letterSpacing={fuzzyMetrics.letterSpacingSecondary}
                  enableHover
                  clickEffect={false}
                  glitchMode={false}
                  glitchInterval={2000}
                  glitchDuration={200}
                  className="ir-landing__fuzzy-canvas ir-landing__fuzzy-canvas--secondary"
                >
                  {fuzzyMetrics.textTransform === 'uppercase' ? 'RECORD' : 'Record'}
                </FuzzyText>
              </span>
            ) : null}
          </h1>
          <div className="ir-landing__text" lang={language === 'zh' ? 'zh-TW' : 'en'}>
            {paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </div>
          <div className="ir-landing__actions">
            <Link className="ir-landing__action ir-landing__action--live" href="/experience" data-testid="link-home-live-interaction">
              <span>{language === 'zh' ? '即時互動' : 'LIVE INTERACTION'}</span>
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M4.25 15.75 15.5 4.5M6 4.5h9.5V14" stroke="currentColor" strokeWidth="1.35" />
              </svg>
            </Link>
            <Link className="ir-landing__action ir-landing__action--video" href="/video-distortion" data-testid="link-home-video-distortion">
              <span>{language === 'zh' ? '影片偏差化' : 'VIDEO DISTORTION'}</span>
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M4.25 15.75 15.5 4.5M6 4.5h9.5V14" stroke="currentColor" strokeWidth="1.35" />
              </svg>
            </Link>
          </div>
        </div>
        <div className="ir-landing__edge-mark" aria-hidden="true" />
      </section>
      <footer className="ir-landing__footer" aria-hidden="true"><span /></footer>
    </main>
  );
}
