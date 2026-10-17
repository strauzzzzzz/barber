import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Шторка снизу: выезд без «подпрыгивания», закрытие по Esc, тапу на фон и кнопке. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const [state, setState] = useState<'in' | 'open' | 'closing'>('in');
  const ref = useRef<HTMLDivElement>(null);
  const prev = useRef<Element | null>(null);

  useEffect(() => {
    prev.current = document.activeElement;
    const id = requestAnimationFrame(() => { setState('open'); ref.current?.focus(); });
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    addEventListener('keydown', key);
    return () => { cancelAnimationFrame(id); removeEventListener('keydown', key); (prev.current as HTMLElement | null)?.focus?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function close() {
    setState('closing');
    setTimeout(onClose, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 200);
  }

  return (
    <>
      <div className={`backdrop${state === 'open' ? ' open' : ''}`} onClick={close} />
      <div className="sheet-wrap">
        <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={`sheet glass${state === 'open' ? ' open' : ''}${state === 'closing' ? ' closing' : ''}`}>
          <div className="grab" aria-hidden="true" />
          <div className="row between" style={{ marginBottom: 12 }}>
            <h2>{title}</h2>
            <button className="icon-btn" onClick={close} aria-label="Закрыть">
              <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
          {children}
        </div>
      </div>
    </>
  );
}
