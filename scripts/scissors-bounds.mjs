// Считает реальные границы нарисованных ножниц (закрытых и раскрытых), чтобы подобрать viewBox: node scripts/scissors-bounds.mjs
import sharp from 'sharp';
import { scissors } from '../shared/scissors.ts';

const S = 1024; // холст 0..512 → 1024 px
const box = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 };
for (const rest of [-3, 28]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-256 -256 1024 1024" width="${S * 2}" height="${S * 2}">${scissors('b', { anim: false, rest })}</svg>`;
  const { data, info } = await sharp(Buffer.from(svg)).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * 4 + 3] > 20) {
      const ux = x / 2 - 256, uy = y / 2 - 256;
      box.x0 = Math.min(box.x0, ux); box.x1 = Math.max(box.x1, ux); box.y0 = Math.min(box.y0, uy); box.y1 = Math.max(box.y1, uy);
    }
  }
}
console.log(box, `viewBox "${Math.floor(box.x0 - 12)} ${Math.floor(box.y0 - 12)} ${Math.ceil(box.x1 - box.x0 + 24)} ${Math.ceil(box.y1 - box.y0 + 24)}"`);
