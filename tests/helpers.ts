import { SALON } from '../shared/config';
import { zonedToMs } from '../shared/time';
import { memoryStore } from '../api/_lib/memory';
import * as seed from '../shared/seed';

// Фиксированное «сейчас»: понедельник 2026-10-19, 09:00 по времени салона.
export const NOW = zonedToMs('2026-10-19', '09:00', SALON.timezone);
export const store = () => memoryStore(NOW);
export const S = seed.S;
export const M = seed.M;
