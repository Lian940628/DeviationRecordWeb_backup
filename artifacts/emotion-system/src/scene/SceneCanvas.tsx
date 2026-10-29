import { useEffect, useRef } from 'react';
import { createArtworkScene } from './artworkScene';

export function SceneCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      return createArtworkScene(canvas);
    } catch {
      return undefined;
    }
  }, []);
  return (
    <div className="scene-layers" aria-hidden="true">
      <div className="ambient-particles">
        {Array.from({ length: 48 }, (_, index) => (
          <span
            key={index}
            className="ambient-particle"
            style={{
              left: `${(index * 37 + 9) % 100}%`,
              top: `${(index * 61 + 13) % 100}%`,
              animationDelay: `${-((index * 7) % 19) / 2}s`,
              opacity: 0.2 + ((index * 11) % 7) / 20,
              transform: `scale(${0.65 + ((index * 3) % 9) / 10})`,
            }}
          />
        ))}
      </div>
      <canvas ref={canvasRef} className="scene-canvas" data-testid="canvas-artwork-particles" />
    </div>
  );
}
