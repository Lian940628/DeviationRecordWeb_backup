import { useEffect, useRef, useState, type CSSProperties } from 'react';
import './siteInteractionEffects.css';

interface Pulse { id: number; x: number; y: number }
interface Flash { id: number; x: number; y: number; angle: number }

export function SiteInteractionEffects() {
  const haloRef = useRef<HTMLDivElement>(null);
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const [flashes, setFlashes] = useState<Flash[]>([]);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const timers = new Set<number>();
    let sequence = 0;
    let previous: { x: number; y: number } | null = null;
    let lastFlashAt = 0;
    const activeTouches = new Map<number, { x: number; y: number; lastFlashAt: number }>();
    const createFlash = (x: number, y: number, dx: number, dy: number, now: number) => {
      const flash = {
        id: ++sequence,
        x,
        y,
        angle: Math.atan2(dy, dx) * (180 / Math.PI),
      };
      setFlashes((current) => [...current.slice(-5), flash]);
      const timer = window.setTimeout(() => {
        setFlashes((current) => current.filter((item) => item.id !== flash.id));
        timers.delete(timer);
      }, 480);
      timers.add(timer);
      return now;
    };
    const move = (event: PointerEvent) => {
      if (reduced.matches) return;
      if (event.pointerType === 'touch') {
        if (!event.isPrimary || event.buttons === 0) return;
        const priorTouch = activeTouches.get(event.pointerId);
        const now = performance.now();
        if (priorTouch) {
          const dx = event.clientX - priorTouch.x;
          const dy = event.clientY - priorTouch.y;
          if (Math.hypot(dx, dy) > 12 && now - priorTouch.lastFlashAt > 64) {
            priorTouch.lastFlashAt = createFlash(event.clientX, event.clientY, dx, dy, now);
          }
          priorTouch.x = event.clientX;
          priorTouch.y = event.clientY;
        } else {
          activeTouches.set(event.pointerId, { x: event.clientX, y: event.clientY, lastFlashAt: now });
        }
        return;
      }
      if (!haloRef.current || (event.pointerType !== 'mouse' && event.pointerType !== 'pen')) return;
      haloRef.current.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0) translate(-50%, -50%)`;
      haloRef.current.style.opacity = '.65';
      const now = performance.now();
      if (previous) {
        const dx = event.clientX - previous.x;
        const dy = event.clientY - previous.y;
        if (Math.hypot(dx, dy) > 18 && now - lastFlashAt > 30) {
          createFlash(previous.x + dx * .42, previous.y + dy * .42, dx, dy, now);
          lastFlashAt = now;
        }
      }
      previous = { x: event.clientX, y: event.clientY };
    };
    const leave = () => {
      previous = null;
      if (haloRef.current) haloRef.current.style.opacity = '0';
    };
    const press = (event: PointerEvent) => {
      if (reduced.matches || event.button !== 0) return;
      const pulse = { id: ++sequence, x: event.clientX, y: event.clientY };
      setPulses((current) => [...current.slice(-3), pulse]);
      if (event.pointerType === 'touch' && event.isPrimary) {
        activeTouches.set(event.pointerId, { x: event.clientX, y: event.clientY, lastFlashAt: performance.now() });
      }
      const timer = window.setTimeout(() => {
        setPulses((current) => current.filter((item) => item.id !== pulse.id));
        timers.delete(timer);
      }, 600);
      timers.add(timer);
    };
    const endTouch = (event: PointerEvent) => activeTouches.delete(event.pointerId);
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerdown', press, { passive: true });
    window.addEventListener('pointerup', endTouch, { passive: true });
    window.addEventListener('pointercancel', endTouch, { passive: true });
    document.documentElement.addEventListener('pointerleave', leave);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', press);
      window.removeEventListener('pointerup', endTouch);
      window.removeEventListener('pointercancel', endTouch);
      document.documentElement.removeEventListener('pointerleave', leave);
      timers.forEach(window.clearTimeout);
    };
  }, []);

  return (
    <div className="site-interaction-effects" aria-hidden="true">
      <div className="site-pointer-halo" ref={haloRef} />
      {flashes.map((flash) => (
        <i
          className="site-flash-trail"
          key={flash.id}
          style={{ left: flash.x, top: flash.y, '--trail-angle': `${flash.angle}deg` } as CSSProperties}
        />
      ))}
      {pulses.map((pulse) => (
        <i className="site-click-pulse" key={pulse.id} style={{ left: pulse.x, top: pulse.y }} />
      ))}
    </div>
  );
}
