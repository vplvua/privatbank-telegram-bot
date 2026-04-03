# План розробки: PrivatBank FOP Transaction Notifier Bot

**Дата:** 2026-04-03
**Статус:** Draft
**На основі:** PRD v1.0, ADR-001–007, privatbank-api-reference.md

---

## Поточний стан

- Інфраструктура готова: Next.js 16, Vercel cron (`*/5 * * * *`), Upstash Redis підключено
- Документація повна (PRD, ADR, API reference)
- Всі 5 модулів — порожні стаби: `types.ts`, `privatbank.ts`, `telegram.ts`, `storage.ts`, `route.ts`

---

## Фази розробки

### Фаза 1: Типи та контракти

**Файл:** `lib/types.ts`

| Завдання | Деталі |
|----------|--------|
| Інтерфейс `PrivatTransaction` | Всі поля з API reference (TRANTYPE, SUM, CCY, OSND, AUT_CNTR_NAM, REF, REFN, PR_PR, FL_REAL тощо) |
| Інтерфейс `PrivatTransactionsResponse` | `status`, `type`, `exist_next_page`, `next_page_id`, `transactions[]` |
| Інтерфейс `PrivatSettingsResponse` | `status`, `type`, `settings: { phase, work_balance, ... }` |
| Інтерфейс `StorageState` | `{ processedKeys: string[], checkedAt: string }` |

**Критерій:** `npx tsc --noEmit` проходить.

---

### Фаза 2: Storage layer (Upstash Redis)

**Файл:** `lib/storage.ts`

| Завдання | Деталі |
|----------|--------|
| Ініціалізація `@upstash/redis` клієнта | Через env змінні `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` |
| `getProcessedState()` | Читає ключ `last_processed_txns`, повертає `StorageState \| null` |
| `saveProcessedState(state)` | Записує `StorageState` в Redis |
| Перший запуск (cold start) | Якщо ключ відсутній — повертає `null`, оркестратор збереже поточні ключі без відправки |

**Критерій:** модуль імпортується без помилок, типи збігаються з `types.ts`.

---

### Фаза 3: PrivatBank API клієнт

**Файл:** `lib/privatbank.ts`

| Завдання | Деталі |
|----------|--------|
| `checkServerStatus()` | `GET /api/statements/settings` — перевірка `phase === 'WRK'` та `work_balance === 'N'` |
| `fetchInterimTransactions()` | `GET /api/statements/transactions/interim?acc={IBAN}&limit=100` |
| Пагінація | Якщо `exist_next_page === true` — повторити з `followId`, зібрати всі транзакції |
| Headers | `token`, `Content-Type: application/json;charset=utf-8`, `User-Agent: privatbank-tg-bot` |
| Фільтрація | Повертати тільки `PR_PR === 'r' && FL_REAL === 'r'` |
| Error handling | При помилці API — throw з описовим повідомленням, не крашити процес |

**Критерій:** функції експортуються, типи відповідають `PrivatTransactionsResponse`. Ручна перевірка з реальним токеном.

---

### Фаза 4: Telegram клієнт

**Файл:** `lib/telegram.ts`

| Завдання | Деталі |
|----------|--------|
| `sendTransactionMessage(txn)` | Форматує транзакцію та надсилає через Bot API `sendMessage` |
| Формат надходження | `🟢 Надходження` — сума, від кого, призначення, час |
| Формат списання | `🔴 Списання` — сума, отримувач, призначення, час |
| `sendHeartbeat(status)` | Щоденне повідомлення "бот живий" (FR-09, Should Have) |
| `parse_mode` | `HTML` для форматування |
| Error handling | При помилці Telegram API — логувати, повертати `false` |

**Формат повідомлення (з PRD):**

```
🟢 Надходження
Сума: +5 000,00 UAH
Від: ТОВ "КЛІЄНТ"
Призначення: Оплата за послуги, рахунок №123
Час: 02.04.2026 14:32
```

**Критерій:** тестове повідомлення приходить в Telegram чат.

---

### Фаза 5: Оркестратор (cron route)

**Файл:** `app/api/cron/route.ts`

| Завдання | Деталі |
|----------|--------|
| Верифікація cron | Перевірка `Authorization` header від Vercel (`CRON_SECRET`) |
| Крок 1 | Перевірити статус сервера PrivatBank (`checkServerStatus()`) |
| Крок 2 | Отримати проміжну виписку (`fetchInterimTransactions()`) |
| Крок 3 | Прочитати стан зі storage (`getProcessedState()`) |
| Крок 4 — Cold start | Якщо `state === null` — зберегти поточні ключі без відправки (FR-02) |
| Крок 5 — Дедуплікація | Порівняти `REF+REFN` ключі нових транзакцій з `processedKeys` |
| Крок 6 — Відправка | Для кожної нової транзакції — `sendTransactionMessage()` |
| Крок 7 — Збереження | Оновити `processedKeys` та `checkedAt` в Redis |
| Логування | `console.log` на кожному кроці для Vercel Function Logs |
| Error handling | `try/catch` на рівні route — логувати помилку, повернути 200 (щоб cron не ретраїв) |

**Критерій:** `npm run build` проходить. Деплой на Vercel — cron спрацьовує, логи видні в dashboard.

---

### Фаза 6: Інтеграційне тестування

| Завдання | Деталі |
|----------|--------|
| Перший запуск (cold start) | Деплой → cron спрацьовує → зберігає поточні ключі → нічого не надсилає |
| Нова транзакція | Дочекатися реальної транзакції → повідомлення приходить в Telegram |
| Дублікати | Переконатися що та сама транзакція не надсилається двічі |
| API недоступний | Відключити токен → cron логує помилку, не крашить |
| Restart стійкість | Перезапустити → бот не надсилає старі транзакції повторно |

---

### Фаза 7: Heartbeat (Should Have)

| Завдання | Деталі |
|----------|--------|
| Логіка heartbeat | В основному cron — перевірити чи минуло 24 години від останнього heartbeat |
| Повідомлення | Статус останньої перевірки, кількість оброблених транзакцій за добу |
| Збереження стану | Додати `lastHeartbeatAt` в `StorageState` |

---

## Порядок імплементації

```
types.ts → storage.ts → privatbank.ts → telegram.ts → route.ts → тестування → heartbeat
    1          2              3              4             5            6            7
```

Кожна фаза — окремий коміт. Після фази 5 — перший деплой на Vercel для перевірки.

---

## Залежності між модулями

```
route.ts (оркестратор)
  ├── privatbank.ts  ← використовує types.ts
  ├── telegram.ts    ← використовує types.ts
  └── storage.ts     ← використовує types.ts
```

Модулі `privatbank`, `telegram`, `storage` незалежні один від одного — залежать тільки від `types.ts`.

---

## Definition of Done (v1)

- [ ] Бот надсилає повідомлення про реальну транзакцію протягом 5 хвилин
- [ ] Після перезапуску не надсилає вже оброблені транзакції
- [ ] Працює 7+ днів без ручного втручання
- [ ] `npm run build` проходить без помилок
- [ ] Всі env змінні налаштовані на Vercel
