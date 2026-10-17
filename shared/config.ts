// Все значения, которые нужно заменить под свой салон, собраны здесь (см. README → «Что заменить»).

export const SALON = {
  name: 'Black Razor',
  tagline: 'Барбершоп и салон красоты',
  phone: '+7 (900) 000-00-00',
  address: 'ул. Примерная, 1',
  timezone: 'Europe/Moscow', // IANA-зона салона: расписание и слоты считаются в ней
  currency: '₽',
};

export const BOOKING = {
  slotStepMin: 30, // шаг сетки слотов
  minLeadMin: 60, // нельзя записаться ближе чем через N минут
  horizonDays: 30, // на сколько дней вперёд открыта запись
  cancelMinHours: 2, // отмена/перенос не позднее чем за N часов до визита
  maxActivePerClient: 5, // защита от спама: активных записей на одну сессию
  defaultStatus: 'confirmed' as 'pending' | 'confirmed',
};

export const CHAT = {
  model: 'openai/gpt-oss-120b', // Groq, production, поддерживает tool calling
  fallbackModel: 'llama-3.3-70b-versatile', // если основная модель вернула tool_use_failed
  maxMessageChars: 500, // длина одного сообщения клиента
  maxHistory: 10, // сколько последних сообщений уходит в модель
  ratePerMinute: 10, // сообщений в минуту с одного клиента
  maxToolRounds: 4, // сколько раундов вызова инструментов за один ответ
  maxTokens: 700,
  temperature: 0.3,
};

export const STATUS_LABELS: Record<string, string> = {
  pending: 'Ожидает',
  confirmed: 'Подтверждена',
  arrived: 'Пришёл',
  no_show: 'Не пришёл',
  cancelled: 'Отменена',
};
export const ACTIVE_STATUSES = ['pending', 'confirmed', 'arrived'];

export const TEXTS = {
  greeting: `Здравствуйте! Я помогу выбрать мастера и свободное время в «${SALON.name}». Напишите, когда вам удобно, — покажу реальные свободные окна и цены.`,
  quick: [
    { label: 'Записаться сегодня', text: 'Хочу записаться сегодня' },
    { label: 'Ближайшее свободное время', text: 'Покажите ближайшее свободное время' },
    { label: 'Мои записи', text: 'Покажите мои записи' },
  ],
  guardFallback: 'Сверяю с расписанием: вот что реально свободно.',
  llmDown: 'Помощник сейчас недоступен. Вы можете записаться вручную на вкладке «Запись».',
  offlineChat: 'Для чата нужен интернет. Подключитесь к сети — и я снова смогу показывать свободное время.',
  consentPd: 'Согласен(на) на обработку персональных данных',
  consentReminders: 'Согласен(на) получать напоминания о записи',
};
