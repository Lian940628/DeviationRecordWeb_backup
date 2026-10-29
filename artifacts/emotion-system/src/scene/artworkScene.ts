import * as THREE from 'three';

/** Ambient particles are a purely decorative artwork layer; they are not connected to the camera. */
export function createArtworkScene(canvas: HTMLCanvasElement) {
  let context: WebGL2RenderingContext | null = null;
  try {
    context = canvas.getContext('webgl2', { alpha: true, antialias: true });
  } catch {
    return () => undefined;
  }
  if (!context) return () => undefined;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.z = 8;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    context: context as WebGL2RenderingContext,
    alpha: true,
    antialias: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
  const count = 420;
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * 11;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 7;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 4;
    sizes[i] = .6 + Math.random() * 1.7;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  const material = new THREE.PointsMaterial({ color: 0x57ead7, size: .025, transparent: true, opacity: .72, depthWrite: false, sizeAttenuation: true });
  const points = new THREE.Points(geometry, material);
  scene.add(points);
  let width = 1;
  let height = 1;
  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  let frame = 0;
  const render = (time: number) => {
    frame = requestAnimationFrame(render);
    points.rotation.y = time * .000035;
    points.rotation.x = Math.sin(time * .00008) * .025;
    renderer.render(scene, camera);
  };
  frame = requestAnimationFrame(render);
  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    geometry.dispose();
    material.dispose();
    renderer.dispose();
  };
}
