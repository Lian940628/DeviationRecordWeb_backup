import { useEffect, useRef, useState } from 'react';
import './siteInteractionEffects.css';

interface Pulse { id: number; x: number; y: number }

export function SiteInteractionEffects() {
  const haloRef = useRef<HTMLDivElement>(null);
  const [pulses, setPulses] = useState<Pulse[]>([]);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const timers = new Set<number>();
    let sequence = 0;
    const move = (event: PointerEvent) => {
      if (!haloRef.current || reduced.matches || event.pointerType !== 'mouse') return;
      haloRef.current.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0) translate(-50%, -50%)`;
      haloRef.current.style.opacity = '.65';
    };
    const leave = () => { if (haloRef.current) haloRef.current.style.opacity = '0'; };
    const press = (event: PointerEvent) => {
      if (reduced.matches || event.button !== 0) return;
      const pulse = { id: ++sequence, x: event.clientX, y: event.clientY };
      setPulses((current) => [...current.slice(-3), pulse]);
      const timer = window.setTimeout(() => {
        setPulses((current) => current.filter((item) => item.id !== pulse.id));
        timers.delete(timer);
      }, 600);
      timers.add(timer);
    };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerdown', press, { passive: true });
    document.documentElement.addEventListener('pointerleave', leave);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', press);
      document.documentElement.removeEventListener('pointerleave', leave);
      timers.forEach(window.clearTimeout);
    };
  }, []);

  return (
    <div className="site-interaction-effects" aria-hidden="true">
      <div className="site-pointer-halo" ref={haloRef} />
      {pulses.map((pulse) => (
        <i className="site-click-pulse" key={pulse.id} style={{ left: pulse.x, top: pulse.y }} />
      ))}
    </div>
  );
}
