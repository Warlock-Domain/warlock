import * as THREE from 'three';

export function isleCrackTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.lineJoin = 'round';
  // A shared original texture; wear controls opacity instead of changing the safe-ground mesh.
  for (const [width, color] of [[6, '#21130e'], [2.5, '#ed6328'], [0.8, '#ffc16b']] as const) {
    ctx.lineWidth = width; ctx.strokeStyle = color;
    for (let i = 0; i < 7; i++) {
      const angle = i * Math.PI * 2 / 7;
      const points = Array.from({ length: 6 }, (_, j) => {
        const radius = 12 + j * 10, a = angle + Math.sin(i * 2.1 + j * 1.7) * 0.14;
        return [64 + Math.cos(a) * radius, 64 + Math.sin(a) * radius];
      });
      ctx.beginPath(); points.forEach(([x, y], j) => j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
      const [x, y] = points[3];
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(angle + 0.7) * 20, y + Math.sin(angle + 0.7) * 20); ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
