# ADR: PrivatBank FOP Transaction Notifier Bot

**Project:** privatbank-telegram-bot  
**Date:** 2026-04-02  

---

## ADR-001: Платформа для хостингу

**Status:** Accepted  
**Date:** 2026-04-02

### Context

Потрібна платформа для запуску scheduled функції кожні 5 хвилин. Розглядались варіанти: Vercel (вже є Pro план), Railway/Render (окремий сервіс), VPS (планується в майбутньому), n8n (no-code).

### Decision

**Vercel Serverless Functions + Vercel Cron Jobs**

### Rationale

- Vercel Pro вже оплачений — нульові додаткові витрати
- Вбудований Cron (мінімальний інтервал 1 хвилина на Pro)
- Serverless = немає процесу який може впасти
- Автоматичний перезапуск при помилці
- Знайомий стек для frontend-розробника

### Consequences

- ✅ Найменше рухомих частин
- ✅ Не потрібен окремий моніторинг процесу
- ⚠️ Легка залежність від Vercel KV для стану (але тривіально замінюється при міграції)
- ⚠️ Функція має timeout 60s (Pro) — достатньо для polling

### Rejected Alternatives

| Варіант | Причина відмови |
|---------|----------------|
| Railway (free) | Засинає, можливі пропущені транзакції |
| Railway (paid) | Зайвий щомісячний платіж при наявному Vercel |
| n8n self-hosted | Додаткова інфраструктура, ще одна точка відмови |
| VPS зараз | Ще не готова інфраструктура, можливий варіант в майбутньому |

---

## ADR-002: Persistent Storage для стану

**Status:** Accepted  
**Date:** 2026-04-02

### Context

Необхідно зберігати мінімальний стан між викликами cron-функції: ідентифікатор або timestamp останньої обробленої транзакції. Без цього — дублікати або пропущені транзакції після cold start.

### Decision

**Vercel KV (Redis) для v1. При міграції на VPS — заміна на SQLite або JSON-файл.**

Ключ: `last_processed_txn`  
Значення: JSON `{ "id": "...", "timestamp": "..." }`

### Rationale

- Вбудований в Vercel, нульова конфігурація
- Redis `SET/GET` — простіше не буває
- При міграції замінюється за 15 хвилин (один модуль `storage.ts`)

### Consequences

- ✅ Атомарні операції — no race conditions між cron викликами
- ✅ Ізольований шар — зміна storage не торкається бізнес-логіки
- ⚠️ Vercel KV специфічний імпорт — треба абстрагувати через interface

### Migration Path (VPS)

```typescript
// Замінити тільки цей файл:
// storage/vercel-kv.ts → storage/sqlite.ts або storage/json-file.ts
// Інтерфейс залишається незмінним
interface Storage {
  getLastTransaction(): Promise<LastTxn | null>
  setLastTransaction(txn: LastTxn): Promise<void>
}
```

---

## ADR-003: Мова та рантайм

**Status:** Accepted  
**Date:** 2026-04-02

### Context

Вибір між TypeScript/Node.js та іншими варіантами (Python, Go).

### Decision

**TypeScript (Node.js 20)**

### Rationale

- Основний стек розробника (Angular, React Native)
- Vercel нативно підтримує TypeScript без додаткової конфігурації
- Типізація критична для роботи з API-відповідями ПриватБанку
- Спільна екосистема з основними проєктами (npm, tsconfig)

### Consequences

- ✅ Знайомий синтаксис, швидша розробка
- ✅ Статична типізація захищає від помилок при парсингу транзакцій
- ✅ Перевикористання типів/утиліт з інших проєктів при потребі

---

## ADR-004: Стратегія polling PrivatBank API

**Status:** Accepted  
**Date:** 2026-04-02

### Context

PrivatBank API не надає вебхуків. Потрібно вибрати стратегію визначення нових транзакцій.

### Decision

**Time-based polling з sliding window + deduplication за ID транзакції**

Алгоритм:
1. Cron запускається кожні 5 хвилин
2. Запит транзакцій за останні 10 хвилин (window з перекриттям)
3. Фільтрація по `lastProcessedTimestamp` + перевірка ID на дублікат
4. Надсилання нових транзакцій в Telegram
5. Оновлення `lastProcessedTimestamp`

### Rationale

- Window з перекриттям (10 хв при 5-хв інтервалі) захищає від втрати транзакцій при затримці API
- Deduplication за ID захищає від дублікатів при overlap
- Простіше ніж cursor-based підхід, достатньо для одного рахунку

### Consequences

- ✅ Надійність: навіть при затримці cron транзакції не втрачаються
- ✅ Простота: одна логіка без edge cases
- ⚠️ При дуже великому обсязі транзакцій за 10 хвилин — пагінація (unlikely для ФОП)

---

## ADR-005: Структура проєкту

**Status:** Accepted  
**Date:** 2026-04-02

### Decision

```
privatbank-telegram-bot/
├── api/
│   └── cron/
│       └── check-transactions.ts   ← Vercel Serverless Function (cron target)
├── lib/
│   ├── privatbank.ts               ← PrivatBank API client
│   ├── telegram.ts                 ← Telegram Bot API client
│   ├── storage.ts                  ← Storage interface + Vercel KV impl
│   └── types.ts                    ← Shared TypeScript types
├── vercel.json                     ← Cron config
├── .env.local                      ← Local dev secrets
└── package.json
```

### Rationale

- `lib/storage.ts` ізольований — єдина точка заміни при міграції на VPS
- `lib/privatbank.ts` та `lib/telegram.ts` — чисті клієнти без side effects
- Мінімальна структура без зайвих абстракцій

---

## ADR-006: Cron інтервал

**Status:** Accepted  
**Date:** 2026-04-02

### Decision

**Кожні 5 хвилин** (`*/5 * * * *`)

### Rationale

- Баланс між свіжістю даних та навантаженням на PrivatBank API
- 5 хвилин — достатня затримка для бізнес-сповіщень (не потрібен real-time)
- Vercel Pro дозволяє мінімум 1 хвилину, але 5 хвилин більш ніж достатньо
- При потребі легко змінити без коду (тільки `vercel.json`)

### Consequences

- 288 викликів API на добу → добре в межах лімітів ПриватБанку
- Максимальна затримка сповіщення: 5 хвилин

---

## ADR-007: Observability / Моніторинг

**Status:** Accepted  
**Date:** 2026-04-02

### Decision

**Мінімальний підхід: console.log + Vercel Function Logs + Heartbeat в Telegram**

Реалізація:
- `console.log` для всіх ключових подій (кожна транзакція, помилки API)
- Vercel Dashboard → Functions → Logs для дебагу
- Щоденне heartbeat повідомлення в Telegram о 09:00 зі статусом останньої перевірки

### Rationale

- Для персонального бота складний моніторинг (Datadog, Sentry) надмірний
- Heartbeat в Telegram — найпростіший спосіб знати що бот живий
- При проблемах — Vercel logs достатньо для діагностики

### Consequences

- ✅ Нульова вартість і складність
- ✅ Heartbeat одразу помітний якщо щось пішло не так
- ⚠️ Немає алертів при падінні (тільки відсутність heartbeat)
