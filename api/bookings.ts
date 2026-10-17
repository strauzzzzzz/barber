import { clientIp, clientToken, route } from './_lib/http';
import { AppError, cancelBooking, createBooking, listMine, rescheduleBooking } from './_lib/booking';
import { BOOKING } from '../shared/config';

// GET — мои записи, POST — создать (ручная запись и кнопка «Подтвердить» в чате),
// PATCH — перенести, DELETE — отменить. Клиент определяется по x-client-token.
export default route(['GET', 'POST', 'PATCH', 'DELETE'], async (req, _res, store) => {
  const token = clientToken(req);
  const b = (req.body ?? {}) as Record<string, any>;
  if (req.method !== 'GET') {
    // тот же лимит, что и в чате, чтобы нельзя было перебирать коды/слоты
    const ok = await store.hitRate(`bk:${token || clientIp(req)}`, 60, WRITES_PER_MIN);
    if (!ok) throw new AppError(429, 'RATE_LIMIT', 'Слишком много запросов. Подождите минуту.', { retry_after: 60 });
  }
  switch (req.method) {
    case 'GET':
      return { bookings: await listMine(store, token) };
    case 'POST':
      return { booking: await createBooking(store, { ...(b as any), token, source: b.source === 'chat' ? 'chat' : 'web' }) };
    case 'PATCH':
      return { booking: await rescheduleBooking(store, b.ref, token, b.date, b.time) };
    default:
      return { booking: await cancelBooking(store, String(b.ref ?? ''), token) };
  }
});

const WRITES_PER_MIN = BOOKING.maxActivePerClient * 4;
