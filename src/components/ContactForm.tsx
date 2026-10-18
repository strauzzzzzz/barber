import { TEXTS } from '../../shared/config';
import { cleanName, isName, normalizePhone } from '../../shared/validate';

export interface Contact { name: string; phone: string; consent: boolean; reminders: boolean }
export type ContactErrors = Partial<Record<'name' | 'phone' | 'consent', string>>;

export function validateContact(c: Contact): ContactErrors {
  const e: ContactErrors = {};
  if (!isName(cleanName(c.name))) e.name = 'Введите имя, не короче 2 символов';
  if (!normalizePhone(c.phone)) e.phone = 'Введите телефон полностью, например +7 900 000-00-00';
  if (!c.consent) e.consent = 'Без согласия на обработку данных записать вас не получится';
  return e;
}

export function ContactForm({ value, onChange, errors, idp = 'c' }: { value: Contact; onChange: (c: Contact) => void; errors: ContactErrors; idp?: string }) {
  const set = (p: Partial<Contact>) => onChange({ ...value, ...p });
  return (
    <div className="stack">
      <div className="field">
        <label htmlFor={`${idp}-name`}>Имя</label>
        <input id={`${idp}-name`} className="input" autoComplete="given-name" value={value.name} maxLength={60}
          aria-invalid={!!errors.name} aria-describedby={errors.name ? `${idp}-name-e` : undefined}
          onChange={(e) => set({ name: e.target.value })} />
        {errors.name && <p id={`${idp}-name-e`} className="err" role="alert">{errors.name}</p>}
      </div>
      <div className="field">
        <label htmlFor={`${idp}-phone`}>Телефон</label>
        <input id={`${idp}-phone`} className="input num" type="tel" inputMode="tel" autoComplete="tel" placeholder="+7 900 000-00-00" value={value.phone} maxLength={20}
          aria-invalid={!!errors.phone} aria-describedby={errors.phone ? `${idp}-phone-e` : undefined}
          onChange={(e) => set({ phone: e.target.value })} />
        {errors.phone && <p id={`${idp}-phone-e`} className="err" role="alert">{errors.phone}</p>}
      </div>
      <div>
        <label className="check">
          <input type="checkbox" checked={value.consent} aria-invalid={!!errors.consent} onChange={(e) => set({ consent: e.target.checked })} />
          <span>{TEXTS.consentPd} <span className="faint">(обязательно)</span></span>
        </label>
        {errors.consent && <p className="err" role="alert">{errors.consent}</p>}
        <label className="check">
          <input type="checkbox" checked={value.reminders} onChange={(e) => set({ reminders: e.target.checked })} />
          <span>{TEXTS.consentReminders}</span>
        </label>
      </div>
    </div>
  );
}
