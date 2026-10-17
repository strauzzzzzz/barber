/** Телефон → '+7XXXXXXXXXX' (или '+' + цифры). null, если не похож на телефон. */
export function normalizePhone(raw: string): string | null {
  let d = String(raw).replace(/\D/g, '');
  if (d.length === 11 && d[0] === '8') d = '7' + d.slice(1);
  if (d.length === 10) d = '7' + d;
  return d.length >= 11 && d.length <= 15 ? '+' + d : null;
}

export const cleanName = (raw: string) => String(raw).replace(/\s+/g, ' ').trim();
export const isName = (s: string) => s.length >= 2 && s.length <= 60;
