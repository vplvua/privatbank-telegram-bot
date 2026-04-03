# PrivatBank API — довідник для Transaction Notifier Bot

> Джерело: Опис API для взаємодії з серверною частиною Автоклієнта v3.0.0  
> Базовий URL: `https://acp.privatbank.ua`

---

## 1. Авторизація

### Отримання токена
1. Приват24 для Бізнесу → Каталог послуг → **Інтеграція (Автоклієнт)**
2. Натиснути «Підключити API» → ввести назву додатка → «Підключити»
3. Перейти в налаштування → «Приймаю» → скопіювати **token**

> ⚠️ Для ФОП сервіс доступний на **будь-якому тарифі**

### Обов'язкові headers для всіх запитів

```http
token: <твій_токен>
Content-Type: application/json;charset=utf-8
User-Agent: privatbank-tg-bot
```

> Підтримувані кодування: `utf-8` та `cp1251`. Якщо `charset` не зазначено — за замовчуванням `cp1251`. Рекомендується явно вказувати `utf-8`.

> ⚠️ Протоколи TLS 1.0 та 1.1 не підтримуються. Використовувати **TLS 1.2+**

---

## 2. Перевірка стану сервера

Перед запитами транзакцій варто перевірити чи сервер в робочому стані.

```http
GET /api/statements/settings
```

### Відповідь

```json
{
  "status": "SUCCESS",
  "type": "settings",
  "settings": {
    "phase": "WRK",
    "work_balance": "N",
    "today": "02.04.2026 00:00:00",
    "lastday": "01.04.2026 00:00:00",
    "server_date_time": "02.04.2026 12:03:51",
    "date_final_statement": "01.04.2026 00:00:00"
  }
}
```

### Важливі поля

| Поле | Значення | Коментар |
|---|---|---|
| `phase` | `WRK` | Норма. Якщо інше — запити можуть повертати помилки |
| `work_balance` | `N` | Норма, запити дозволені. `Y` — не робити запити |
| `today` | дата | Поточний операційний день |
| `lastday` | дата | Попередній операційний день |

---

## 3. Отримання транзакцій

### 3.1 Проміжна виписка (основний ендпоінт для бота)

Повертає транзакції **поточного операційного дня** (від `lastday` до `today`).  
Дати передавати не потрібно.

```http
GET /api/statements/transactions/interim?acc={IBAN}&limit=100
```

### Параметри

| Параметр | Обов'язковий | Опис |
|---|---|---|
| `acc` | Ні | IBAN рахунку. Якщо не передано — всі активні рахунки |
| `limit` | Ні | Кількість записів у пачці. За замовчуванням 20, максимум 500. **Рекомендується не більше 100** |
| `followId` | Ні | ID наступної пачки з попередньої відповіді (для пагінації) |

### 3.2 Виписка за довільний період

```http
GET /api/statements/transactions?acc={IBAN}&startDate=ДД-ММ-РРРР&endDate=ДД-ММ-РРРР&limit=100
```

| Параметр | Обов'язковий | Опис |
|---|---|---|
| `acc` | Ні | IBAN рахунку |
| `startDate` | **Так** | Дата початку, формат `ДД-ММ-РРРР` |
| `endDate` | Ні | Дата закінчення, формат `ДД-ММ-РРРР` |
| `limit` | Ні | Кількість записів, макс 500 |
| `followId` | Ні | Для пагінації |

---

## 4. Структура відповіді з транзакціями

```json
{
  "status": "SUCCESS",
  "type": "transactions",
  "exist_next_page": false,
  "next_page_id": null,
  "transactions": [
    {
      "TRANTYPE": "C",
      "SUM": "5000.00",
      "SUM_E": "5000.00",
      "CCY": "UAH",
      "OSND": "Оплата за послуги згідно договору №123",
      "AUT_CNTR_NAM": "ТОВ КЛІЄНТ",
      "AUT_CNTR_ACC": "UA12345...",
      "AUT_CNTR_MFO": "305299",
      "AUT_MY_ACC": "UA943052990000026100050001037",
      "DAT_KL": "02.04.2026",
      "DAT_OD": "02.04.2026",
      "TIM_P": "14:32",
      "DATE_TIME_DAT_OD_TIM_P": "02.04.2026 14:32:00",
      "ID": "557091731",
      "TECHNICAL_TRANSACTION_ID": "557091731_online",
      "REF": "DNCHK0108B1WKX",
      "REFN": "1",
      "NUM_DOC": "K0108B1WKX",
      "PR_PR": "r",
      "FL_REAL": "r"
    }
  ]
}
```

---

## 5. Поля транзакції — що використовує бот

### Обов'язкові для повідомлення

| Поле | Тип | Опис |
|---|---|---|
| `TRANTYPE` | `C` / `D` | **C** = надходження (Credit), **D** = списання (Debit) |
| `SUM` | string | Сума транзакції |
| `CCY` | string | Валюта (`UAH`, `USD`, `EUR`, ...) |
| `OSND` | string | Призначення платежу |
| `AUT_CNTR_NAM` | string | Назва контрагента |
| `DATE_TIME_DAT_OD_TIM_P` | string | Дата і час, формат `ДД.ММ.РРРР ГГ:ХХ:СС` |

### Для deduplication

| Поле | Опис |
|---|---|
| `REF` | Референс проведення |
| `REFN` | Порядковий номер всередині проведення |

> ⚠️ **Офіційна рекомендація:** для унікальної ідентифікації транзакції використовувати конкатенацію **`REF` + `REFN`**

```typescript
const txnKey = `${txn.REF}${txn.REFN}` // наприклад: "DNCHK0108B1WKX1"
```

### Додаткові поля (для розширеного повідомлення)

| Поле | Опис |
|---|---|
| `AUT_CNTR_ACC` | Рахунок контрагента |
| `AUT_CNTR_MFO` | МФО банку контрагента |
| `AUT_CNTR_MFO_NAME` | Назва банку контрагента |
| `SUM_E` | Сума в національній валюті (для валютних транзакцій) |
| `ID` | Внутрішній ID транзакції |
| `TECHNICAL_TRANSACTION_ID` | Технічний ID (`ID_online`) |

### Поля для фільтрації / перевірки статусу

| Поле | Значення | Опис |
|---|---|---|
| `PR_PR` | `r` | Проведена транзакція ✅ |
| `PR_PR` | `p` | Проводиться |
| `PR_PR` | `t` | Сторнована |
| `PR_PR` | `n` | Забракована |
| `FL_REAL` | `r` | Реальна транзакція ✅ |
| `FL_REAL` | `i` | Нереальна |

> 💡 Для надійності фільтрувати: `PR_PR === 'r' && FL_REAL === 'r'`

---

## 6. Пагінація

Якщо транзакцій більше ніж `limit`, у відповіді буде:

```json
{
  "exist_next_page": true,
  "next_page_id": "620699370_online"
}
```

Для отримання наступної пачки — додати `followId` до запиту:

```http
GET /api/statements/transactions/interim?acc={IBAN}&limit=100&followId=620699370_online
```

Повторювати доки `exist_next_page !== true`.

---

## 7. Коди HTTP помилок

| Код | Причина |
|---|---|
| `401` | Невірний або відсутній токен |
| `400` | Некоректний формат запиту або відсутні обов'язкові headers |
| `403` | Токен відключено в налаштуваннях Автоклієнта в Приват24 |
| `500`, `502` | Внутрішня помилка сервера |
| `503`, `504` | Тимчасова недоступність сервісу |

---

## 8. Алгоритм роботи бота (підсумок)

```
1. GET /api/statements/settings
   → перевірити phase === 'WRK' && work_balance === 'N'
   → якщо ні — пропустити цей cron-запуск, залогувати

2. GET /api/statements/transactions/interim?acc={IBAN}&limit=100
   → якщо exist_next_page === true — повторити з followId
   → зібрати всі транзакції

3. Для кожної транзакції:
   → перевірити PR_PR === 'r' && FL_REAL === 'r'
   → сформувати ключ: REF + REFN
   → перевірити чи ключ вже є в storage (Vercel KV)
   → якщо новий — надіслати в Telegram, зберегти ключ

4. Оновити lastCheckedAt в storage
```

---

## 9. Приклад TypeScript-типу для транзакції

```typescript
interface PrivatTransaction {
  TRANTYPE: 'C' | 'D'
  SUM: string
  SUM_E: string
  CCY: string
  OSND: string
  AUT_CNTR_NAM: string
  AUT_CNTR_ACC: string
  AUT_CNTR_MFO: string
  AUT_CNTR_MFO_NAME: string
  AUT_MY_ACC: string
  DAT_KL: string
  DAT_OD: string
  TIM_P: string
  DATE_TIME_DAT_OD_TIM_P: string
  ID: string
  TECHNICAL_TRANSACTION_ID: string
  REF: string
  REFN: string
  NUM_DOC: string
  PR_PR: 'r' | 'p' | 't' | 'n'
  FL_REAL: 'r' | 'i'
}

interface PrivatTransactionsResponse {
  status: 'SUCCESS' | 'ERROR'
  type: 'transactions'
  exist_next_page: boolean
  next_page_id: string | null
  transactions: PrivatTransaction[]
}
```
