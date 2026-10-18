import { route } from './_lib/http';
import { AppError, freeSlots } from './_lib/booking';
import { isDate } from '../shared/time';

export default route(['GET'], async (req, _res, store) => {
  const q = req.query as Record<string, string>;
  if (!isDate(q.date_from) || !isDate(q.date_to) || !q.service_id) throw new AppError(400, 'BAD_INPUT', 'Нужны service_id, date_from, date_to');
  const r = await freeSlots(store, { serviceId: q.service_id, masterId: q.master_id || undefined, dateFrom: q.date_from, dateTo: q.date_to, excludeBookingId: q.exclude || undefined });
  return { groups: r.groups };
});
