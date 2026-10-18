// Единый рисунок ножниц: логотип в приложении (с классами для анимации) и иконки PWA (статичные, make-icons.mjs).
// Парикмахерские ножницы: длинные тонкие лезвия, изогнутые ручки с кольцами, винт на оси. Рисуем «лезвиями вверх»
// и поворачиваем группу .pose на POSE градусов (кольца слева сверху, лезвия вправо вниз — как на образце).
// Половинка b — зеркало a относительно x = 256; винт в (256, 250).

import { THEME } from './config.ts';

const BLADE = 'M248 262 L255 14 C276 108 294 192 289 262 Z';
const SPARK_Y = 22;

export const POSE = 145;
export const SCISSORS_VIEWBOX = '29 28 449 469'; // границы рисунка (с запасом под искру): node scripts/scissors-bounds.mjs
export const SCISSORS_RATIO = 449 / 469; // ширина / высота viewBox

/** uid — уникальный суффикс id градиентов (на странице бывает два логотипа). anim — блики и искра для анимации. */
export function scissors(uid: string, opts: { anim?: boolean; rest?: number } = {}): string {
  const { anim = true, rest } = opts;
  const u = (n: string) => `url(#${n}-${uid})`;
  const half = (cls: 'a' | 'b') => {
    const mirror = cls === 'b' ? ' transform="matrix(-1 0 0 1 512 0)"' : '';
    const angle = rest === undefined ? '' : ` transform="rotate(${cls === 'a' ? rest : -rest} 256 250)"`;
    return `<g class="half ${cls}"${angle}><g${mirror}>
      <path d="M256 250 C250 316 232 352 206 374" stroke="${u('red')}" stroke-width="15" stroke-linecap="round" fill="none"/>
      <circle cx="194" cy="406" r="40" fill="none" stroke="${u('red')}" stroke-width="15"/>
      <path d="M162 396 A38 38 0 0 1 180 372" stroke="#fff" stroke-opacity=".55" stroke-width="4" stroke-linecap="round" fill="none"/>
      <path class="blade" d="${BLADE}" fill="${u('steel')}" stroke="rgba(10,10,14,.55)" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="M251.5 256 L255.4 34" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".92" fill="none"/>
      <path d="M279 250 C284 176 278 100 262 44" fill="none" stroke="#000" stroke-opacity=".18" stroke-width="2.2"/>
      ${anim ? `<g clip-path="url(#bc-${uid})"><g class="sheen"><rect x="190" y="10" width="44" height="280" fill="${u('sheen')}" transform="skewX(-14)"/></g></g>` : ''}
    </g></g>`;
  };
  return `<defs>
    <linearGradient id="steel-${uid}" gradientUnits="userSpaceOnUse" x1="244" y1="0" x2="294" y2="0"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#cfd4dc"/><stop offset="1" stop-color="#7f8796"/></linearGradient>
    <linearGradient id="red-${uid}" gradientUnits="userSpaceOnUse" x1="0" y1="250" x2="0" y2="450"><stop offset="0" stop-color="${THEME.handle[0]}"/><stop offset=".55" stop-color="${THEME.handle[1]}"/><stop offset="1" stop-color="${THEME.handle[2]}"/></linearGradient>
    <linearGradient id="sheen-${uid}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <radialGradient id="metal-${uid}" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#aeb4bf"/><stop offset="1" stop-color="#5b6270"/></radialGradient>
    <clipPath id="bc-${uid}"><path d="${BLADE}"/></clipPath>
  </defs>
  <g class="pose" transform="rotate(${POSE} 256 250)"><g class="rock">${half('a')}${half('b')}
    <circle cx="256" cy="250" r="16" fill="${u('metal')}" stroke="#23232a" stroke-width="3"/>
    <path d="M247.5 244 L264.5 256" stroke="#2f323b" stroke-width="3" stroke-linecap="round"/>
    <circle cx="250.5" cy="243.5" r="2.6" fill="#fff" opacity=".9"/>
  </g>
  ${anim ? `<g class="spark"><path d="M256 ${SPARK_Y - 44} L263 ${SPARK_Y - 8} L300 ${SPARK_Y} L263 ${SPARK_Y + 8} L256 ${SPARK_Y + 44} L249 ${SPARK_Y + 8} L212 ${SPARK_Y} L249 ${SPARK_Y - 8}Z" fill="#fff"/></g>` : ''}</g>`;
}
