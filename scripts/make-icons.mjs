// node scripts/make-icons.mjs — рисует иконки (барбер-столб) и favicon. Нужен dev-пакет sharp.
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const stripes = Array.from({ length: 9 }, (_, i) => {
  const y = 80 + i * 70;
  return `<path d="M190 ${y} L322 ${y - 66} L322 ${y - 30} L190 ${y + 36} Z" fill="#b3142e"/>`;
}).join('');

const art = `
  <defs>
    <radialGradient id="g" cx="30%" cy="18%" r="75%"><stop offset="0" stop-color="#a8132c" stop-opacity=".55"/><stop offset="1" stop-color="#a8132c" stop-opacity="0"/></radialGradient>
    <radialGradient id="b" cx="100%" cy="100%" r="70%"><stop offset="0" stop-color="#3458b0" stop-opacity=".4"/><stop offset="1" stop-color="#3458b0" stop-opacity="0"/></radialGradient>
    <clipPath id="c"><rect x="190" y="132" width="132" height="268" rx="66"/></clipPath>
  </defs>
  <rect width="512" height="512" fill="#0b0b0e"/>
  <rect width="512" height="512" fill="url(#g)"/><rect width="512" height="512" fill="url(#b)"/>
  <rect x="226" y="92" width="60" height="56" rx="14" fill="#8e8e99"/>
  <rect x="226" y="384" width="60" height="36" rx="14" fill="#8e8e99"/>
  <g clip-path="url(#c)"><rect x="190" y="132" width="132" height="268" fill="#f3f3f5"/>${stripes}</g>
  <rect x="190" y="132" width="132" height="268" rx="66" fill="none" stroke="#f3f3f5" stroke-opacity=".5" stroke-width="5"/>`;

const svg = (round) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${round ? '<clipPath id="r"><rect width="512" height="512" rx="112"/></clipPath><g clip-path="url(#r)">' : '<g>'}${art}</g></svg>`;
// maskable: содержимое в центральных 80%
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#0b0b0e"/><g transform="translate(76.8 76.8) scale(.7)">${art}</g></svg>`;

const out = (f) => new URL(`../public/${f}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
await sharp(Buffer.from(svg(true))).resize(192, 192).png().toFile(out('icons/icon-192.png'));
await sharp(Buffer.from(svg(true))).resize(512, 512).png().toFile(out('icons/icon-512.png'));
await sharp(Buffer.from(maskable)).resize(512, 512).png().toFile(out('icons/maskable-512.png'));
// iOS сам скругляет углы: отдаём квадрат без прозрачности
await sharp(Buffer.from(svg(false))).resize(180, 180).png().toFile(out('icons/apple-touch-icon.png'));
writeFileSync(out('favicon.svg'), svg(true));
console.log('icons ok');
