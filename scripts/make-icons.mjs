// node scripts/make-icons.mjs — рисует иконки и favicon из того же рисунка ножниц, что и логотип (shared/scissors.ts). Нужен dev-пакет sharp.
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { scissors, SCISSORS_VIEWBOX } from '../shared/scissors.ts';
import { THEME } from '../shared/config.ts';

const art = `
  <defs>
    <radialGradient id="g" cx="30%" cy="18%" r="75%"><stop offset="0" stop-color="${THEME.accent}" stop-opacity=".55"/><stop offset="1" stop-color="${THEME.accent}" stop-opacity="0"/></radialGradient>
    <radialGradient id="b" cx="100%" cy="100%" r="70%"><stop offset="0" stop-color="#3458b0" stop-opacity=".4"/><stop offset="1" stop-color="#3458b0" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="512" height="512" fill="${THEME.bg}"/>
  <rect width="512" height="512" fill="url(#g)"/><rect width="512" height="512" fill="url(#b)"/>
  <svg x="52" y="52" width="408" height="408" viewBox="${SCISSORS_VIEWBOX}">${scissors('ic', { anim: false, rest: 14 })}</svg>`;

const svg = (round) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${round ? '<clipPath id="r"><rect width="512" height="512" rx="112"/></clipPath><g clip-path="url(#r)">' : '<g>'}${art}</g></svg>`;
// maskable: содержимое в центральных 80%
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${THEME.bg}"/><g transform="translate(76.8 76.8) scale(.7)">${art}</g></svg>`;

const out = (f) => new URL(`../public/${f}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
await sharp(Buffer.from(svg(true))).resize(192, 192).png().toFile(out('icons/icon-192.png'));
await sharp(Buffer.from(svg(true))).resize(512, 512).png().toFile(out('icons/icon-512.png'));
await sharp(Buffer.from(maskable)).resize(512, 512).png().toFile(out('icons/maskable-512.png'));
// iOS сам скругляет углы: отдаём квадрат без прозрачности
await sharp(Buffer.from(svg(false))).resize(180, 180).png().toFile(out('icons/apple-touch-icon.png'));
writeFileSync(out('favicon.svg'), svg(true));
console.log('icons ok');
