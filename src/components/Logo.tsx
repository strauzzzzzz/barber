import { scissors, SCISSORS_RATIO, SCISSORS_VIEWBOX } from '../../shared/scissors';

/** Логотип: стальные ножницы с красными ручками. Анимации (щелчок, блик, искра) — в motion.css по классам из shared/scissors.ts. */
export function Logo({ uid, size = 96, idle }: { uid: string; size?: number; idle?: boolean }) {
  return (
    <svg className={`logo${idle ? ' idle' : ''}`} width={size * SCISSORS_RATIO} height={size} viewBox={SCISSORS_VIEWBOX} role="img" aria-label="Логотип: ножницы"
      dangerouslySetInnerHTML={{ __html: scissors(uid) }} />
  );
}
