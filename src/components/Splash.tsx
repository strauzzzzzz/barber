import { useLayoutEffect, useRef } from 'react';
import { SALON } from '../../shared/config';
import { Logo } from './Logo';

/**
 * Заставка: ножницы щёлкают в центре, затем плавно «улетают» на место логотипа главной (.hero-logo),
 * а фон растворяется и открывает главный экран. Тап — пропустить.
 */
export function Splash({ fly, onSkip }: { fly: boolean; onSkip: () => void }) {
  const logo = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = logo.current;
    const target = document.querySelector('.hero-logo svg')?.getBoundingClientRect();
    if (!fly || !el || !target) return;
    const s = el.getBoundingClientRect();
    el.style.setProperty('--dx', `${target.left + target.width / 2 - (s.left + s.width / 2)}px`);
    el.style.setProperty('--dy', `${target.top + target.height / 2 - (s.top + s.height / 2)}px`);
    el.style.setProperty('--k', String(target.width / s.width));
  }, [fly]);

  return (
    <div className={`splash${fly ? ' fly' : ''}`} onClick={onSkip} aria-hidden="true">
      <div className="splash-bg"><div className="splash-glow" /></div>
      <div className="splash-logo" ref={logo}><Logo uid="sp" size={230} /></div>
      <div className="splash-text">
        <div className="splash-name">
          {[...SALON.name.toUpperCase()].map((c, i) => <span key={i} style={{ '--i': i } as React.CSSProperties}>{c === ' ' ? ' ' : c}</span>)}
        </div>
        <p className="splash-tag">{SALON.tagline}</p>
      </div>
    </div>
  );
}
