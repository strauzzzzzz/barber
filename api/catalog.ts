import { route } from './_lib/http';

export default route(['GET'], async (_req, _res, store) => {
  const c = await store.catalog();
  const masters = c.masters.filter((m) => m.active);
  return {
    services: c.services.filter((s) => s.active),
    masters,
    links: c.links.filter((l) => masters.some((m) => m.id === l.master_id)),
  };
});
