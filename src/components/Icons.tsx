import type { ReactNode } from 'react';

// Один набор линейных иконок (stroke 1.75). Декоративные скрыты от скринридеров.
const P: Record<string, ReactNode> = {
  chat: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M8 3v4M16 3v4M3.5 10h17" /></>,
  ticket: <><path d="M4 8a2 2 0 0 0 0 4v0a2 2 0 0 1 0 4v0a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v0a2 2 0 0 1 0-4v0a2 2 0 0 0 0-4V7a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1Z" transform="translate(0 .5)" /><path d="M14 6.5v11" strokeDasharray="1.5 2.5" /></>,
  send: <path d="m5 12 14-7-4.5 14-3-5.5L5 12Z" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" />,
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2Z" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  left: <path d="m15 5-7 7 7 7" />,
  right: <path d="m9 5 7 7-7 7" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  star: <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9L3.5 9.7l5.9-.8L12 3.5Z" />,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  user: <><circle cx="12" cy="8.5" r="3.7" /><path d="M5 20c.8-3.6 3.5-5.5 7-5.5s6.2 1.9 7 5.5" /></>,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16v.1" /></>,
  wifioff: <><path d="M3 3l18 18M8.5 16.4a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 3.6-2.3M10.5 6.2A14 14 0 0 1 22 9.5M12 20h.01M2 9.5a14 14 0 0 1 3.5-2.4" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3" />,
  scissors: <><circle cx="6" cy="6" r="2.7" /><circle cx="6" cy="18" r="2.7" /><path d="M8.2 7.6 20 17M8.2 16.4 20 7" /></>,
};

export function Icon({ name, small }: { name: keyof typeof P; small?: boolean }) {
  return (
    <svg className={`icon${small ? ' sm' : ''}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {P[name]}
    </svg>
  );
}
