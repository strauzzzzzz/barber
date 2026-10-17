import { useCallback, useEffect, useState } from 'react';
import type { Catalog } from '../../shared/types';
import { api } from './api';

let cached: Catalog | null = null;
let inflight: Promise<Catalog> | null = null;

/** Каталог (услуги, мастера) грузится один раз и кэшируется в памяти. */
export function useCatalog() {
  const [data, setData] = useState<Catalog | null>(cached);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setError('');
    (inflight ??= api.catalog().finally(() => { inflight = null; }))
      .then((c) => { cached = c; setData(c); }).catch((e) => setError(e.message));
  }, []);
  useEffect(() => { if (!cached) load(); }, [load]);
  return { data, error, reload: load };
}

export function useOnline() {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => {
    const u = () => setOn(true), d = () => setOn(false);
    addEventListener('online', u); addEventListener('offline', d);
    return () => { removeEventListener('online', u); removeEventListener('offline', d); };
  }, []);
  return on;
}

export const rub = (n: number) => `${new Intl.NumberFormat('ru-RU').format(n)} ₽`;
export const plural = (n: number, one: string, few: string, many: string) => {
  const m = n % 100, d = n % 10;
  return m > 10 && m < 20 ? many : d === 1 ? one : d >= 2 && d <= 4 ? few : many;
};
export const reviewsLabel = (n: number) => `${n} ${plural(n, 'отзыв', 'отзыва', 'отзывов')}`;
export const minutes = (n: number) => (n >= 60 ? `${Math.floor(n / 60)} ч${n % 60 ? ` ${n % 60} мин` : ''}` : `${n} мин`);
