# 💳 Transaction Ledger & Balance Management System

[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-B73BFE?style=for-the-badge&logo=vite&logoColor=FFD62E)](https://vitejs.dev/)
[![Jest](https://img.shields.io/badge/Jest-C21325?style=for-the-badge&logo=jest&logoColor=white)](https://jestjs.io/)

A full-stack financial transaction system built with Node.js, PostgreSQL, and React. Handles atomic money transfers, double-entry bookkeeping, idempotency, and automated reconciliation — the core concepts behind real fintech infrastructure.

---

## 📑 Table of Contents

- [Live Demo](#-live-demo)
- [Screenshots](#-screenshots)
- [The Problem It Solves](#-the-problem-it-solves)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Database Schema](#-database-schema)
- [API Reference](#-api-reference)
- [Key Technical Decisions](#-key-technical-decisions)
- [Reconciliation](#-reconciliation)
- [Integration Tests](#-integration-tests)
- [Load Test Results](#-load-test-results)
- [Local Setup](#-local-setup)
- [Project Structure](#-project-structure)
- [Deployment](#-deployment)
- [Known Limitations](#️-known-limitations)
- [What I Learned Building This](#-what-i-learned-building-this)

---

## 🌐 Live Demo

| Service | Link |
|---|---|
| **Frontend** | [Live App](https://transactional-lader-system.vercel.app/) |
| **Backend API** | [API Endpoint](https://ledger-api-anish033.onrender.com) |
| **Health Check** | [Health Status](https://ledger-api-anish033.onrender.com/health) |

> The backend runs on Render's free tier and sleeps when idle, so the first request can take about 30–60 seconds. After that it responds normally.

---

## 📸 Screenshots

**Register Page**  
<img width="761" height="680" alt="Register Page" src="https://github.com/user-attachments/assets/b7c79728-19c8-4aec-9273-a69099ab2e25" />

**Dashboard**  
<img width="1280" height="837" alt="Dashboard" src="https://github.com/user-attachments/assets/43763b1f-ad56-40a8-9549-40ee44acd9d3" />

**Transaction History**  
<img width="1280" height="577" alt="Transaction History" src="https://github.com/user-attachments/assets/4221fe79-9815-42bf-a70a-da59a503c3db" />

**Ledger History**  
<img width="1280" height="838" alt="Ledger History" src="https://github.com/user-attachments/assets/26892918-9078-49b1-b2df-de1ed5b2fc2f" />

---

## 🎯 The Problem It Solves

In any system that moves money, three things must be guaranteed:

1. **You cannot lose money:** If a transfer deducts from the sender but crashes before crediting the receiver, money disappears. *Solved with database transactions — all balance updates are atomic or none happen.*
2. **You cannot duplicate money:** If a user clicks Send twice or the network retries a request, the same transfer cannot process twice. *Solved with idempotency keys stored as a `UNIQUE` constraint in PostgreSQL, plus a per-key lock so two copies of the same request arriving together can't both go through.*
3. **You cannot corrupt balances:** If two transfers hit the same account at the same millisecond, both might read the same balance and overdraft. *Solved with `SELECT FOR UPDATE` — rows are locked before reading so concurrent transfers queue safely.*

---

## ✨ Features

### Phase 1 — Core System

- JWT authentication (register, login, protected routes)
- Auto-create default account on registration
- Deposit money into accounts
- Atomic money transfers using `db.transaction()`
- Paginated transaction history
- Consistent error responses with machine-readable error codes
- Input validation with Zod on every request body (register, login, create account, transfer, deposit)
- Global error handler mapping error codes to HTTP status codes

### Phase 2 — Reliability & Safety

- **`SELECT FOR UPDATE`** with deadlock-safe row ordering (`ORDER BY id`)
- **Idempotency keys** in PostgreSQL — a retried request gets back the original result (including the balance at that moment) without being processed again. Ownership is checked before anything is replayed, and reusing a key for a different request returns `409`
- **Exact money maths** — amounts are handled as whole units of 10⁻⁸ with `BigInt`, never as floating-point numbers
- **Currency check** — transfers between accounts in different currencies are rejected
- **Double‑entry ledger** — every transfer creates `DEBIT` + `CREDIT` entries with `balance_after` snapshots
- **Reconciliation engine** — 3 SQL integrity checks on your own accounts confirm that balances match the ledger and every transfer is recorded properly
- **Automated tests** — 24 Jest tests: 8 run against a real PostgreSQL database (concurrency, rollback, idempotency) and 16 are quick unit checks for edge cases
- **CI** — GitHub Actions runs the whole suite against PostgreSQL 16 on every push
- **Helmet** — 12 HTTP security headers in one line
- **Rate limiting** — 20 auth requests / 100 general requests per 15 minutes per IP
- **Load tested** — 20 concurrent transfers verified correct under concurrency

---

## 🛠 Tech Stack

### Backend

| Technology | Purpose |
|---|---|
| Node.js + Express | HTTP server and REST API |
| PostgreSQL | ACID-compliant database for financial data |
| Knex.js | SQL query builder + migration management |
| bcryptjs | Password hashing with 10 salt rounds |
| jsonwebtoken | JWT signing and verification |
| Zod | Runtime request body schema validation |
| Helmet | 12 HTTP security headers |
| express-rate-limit | Per-IP request limits against brute-force login attempts and request floods |
| Jest + Supertest | Integration and unit testing |

### Frontend

| Technology | Purpose |
|---|---|
| React + Vite | Component-based UI with fast dev server |
| React Router | Client-side page navigation |
| Tailwind CSS | Utility-first styling |
| Context API | Global auth state management |

### Deployment

| Service | What runs there |
|---|---|
| Render | Node.js backend (free web service) |
| Neon | Managed PostgreSQL |
| Vercel | React frontend (static build) |

---

## 🗄 Database Schema

### `users`

| Column        | Type                    | Description                |
|---------------|-------------------------|----------------------------|
| `id`          | UUID (PK)               | Primary key                |
| `email`       | VARCHAR (unique)        | User email                 |
| `password_hash`| VARCHAR                | Hashed password            |
| `role`        | ENUM (`USER`, `ADMIN`)  | User role                  |
| `created_at`  | TIMESTAMP               | Creation timestamp         |

### `accounts`

| Column        | Type                    | Description                        |
|---------------|-------------------------|------------------------------------|
| `id`          | UUID (PK)               | Primary key                        |
| `user_id`     | UUID → `users.id`       | Owner of the account               |
| `name`        | VARCHAR                 | Account name (e.g., "Savings")     |
| `balance`     | NUMERIC(20,8)           | Current balance (exact decimal)    |
| `currency`    | VARCHAR (default `INR`) | Currency code                      |
| `status`      | ENUM (`ACTIVE`, `SUSPENDED`, `CLOSED`) | Account status   |
| `created_at`  | TIMESTAMP               | Creation timestamp                 |

### `transactions`

| Column              | Type                           | Description                              |
|---------------------|--------------------------------|------------------------------------------|
| `id`                | UUID (PK)                      | Primary key                              |
| `idempotency_key`   | VARCHAR (unique)               | Client-generated idempotency key         |
| `from_account_id`   | UUID (nullable)                | Source account (null for deposits)       |
| `to_account_id`     | UUID                           | Destination account                      |
| `amount`            | NUMERIC(20,8)                  | Transfer amount                          |
| `type`              | ENUM (`TRANSFER`, `DEPOSIT`, `WITHDRAWAL`) | Transaction type      |
| `status`            | ENUM (`PENDING`, `COMPLETED`, `FAILED`) | Transaction status          |
| `note`              | VARCHAR (nullable)             | Optional note                            |
| `completed_at`      | TIMESTAMP (nullable)           | When the transaction completed           |
| `created_at`        | TIMESTAMP                      | Creation timestamp                       |

### `ledger_entries`

| Column            | Type                           | Description                                      |
|-------------------|--------------------------------|--------------------------------------------------|
| `id`              | UUID (PK)                      | Primary key                                      |
| `transaction_id`  | UUID → `transactions.id`       | Associated transaction                          |
| `account_id`      | UUID → `accounts.id`           | Account affected                                 |
| `entry_type`      | ENUM (`DEBIT`, `CREDIT`)       | Debit or credit                                  |
| `amount`          | NUMERIC(20,8)                  | Amount of the entry                              |
| `balance_after`   | NUMERIC(20,8)                  | Account balance after this entry (snapshot)      |
| `created_at`      | TIMESTAMP                      | Creation timestamp                               |

---

## 📡 API Reference

All protected endpoints require:

```
Authorization: Bearer <token_received_from_login_or_register>
```

All error responses follow this shape:

```json
{
  "error": {
    "code": "INSUFFICIENT_FUNDS",
    "message": "You do not have enough balance for this transfer"
  }
}
```

### Auth Endpoints

| Method | Endpoint                 | Auth | Description                              |
|--------|--------------------------|------|------------------------------------------|
| POST   | `/api/v1/auth/register`  | No   | Register user + auto-create account, returns JWT |
| POST   | `/api/v1/auth/login`     | No   | Login and receive JWT token              |

### Account Endpoints

| Method | Endpoint                  | Auth | Description                               |
|--------|---------------------------|------|-------------------------------------------|
| GET    | `/api/v1/accounts`        | Yes  | Get all accounts for logged in user       |
| GET    | `/api/v1/accounts/:id`    | Yes  | Get single account by ID                  |
| POST   | `/api/v1/accounts`        | Yes  | Create a new account                      |

### Transaction Endpoints

| Method | Endpoint                                 | Auth | Description                                           |
|--------|------------------------------------------|------|-------------------------------------------------------|
| POST   | `/api/v1/transactions/transfer`          | Yes  | Atomic transfer between accounts (idempotent)         |
| POST   | `/api/v1/transactions/deposit`           | Yes  | Deposit into account (idempotent)                     |
| GET    | `/api/v1/transactions`                   | Yes  | Paginated transaction history                         |
| GET    | `/api/v1/transactions/accounts/:id/history` | Yes  | Ledger entries with balance snapshots              |

### Reconciliation Endpoints

| Method | Endpoint                     | Auth | Description                                 |
|--------|------------------------------|------|---------------------------------------------|
| GET    | `/api/v1/reconciliation/run` | Yes  | Run 3 integrity checks on your own accounts and return a report |

#### Example: Transfer Request

```http
POST /api/v1/transactions/transfer
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

{
  "fromAccountId": "660e8400-e29b-41d4-a716-446655440001",
  "toAccountId":   "770e8400-e29b-41d4-a716-446655440002",
  "amount": "500.00",
  "note": "Splitting rent"
}
```

**Success Response — 201:**

```json
{
  "data": {
    "transaction": {
      "id": "aa0e8400-e29b-41d4-a716-446655440005",
      "from_account_id": "660e8400-e29b-41d4-a716-446655440001",
      "to_account_id":   "770e8400-e29b-41d4-a716-446655440002",
      "amount": "500.00000000",
      "type": "TRANSFER",
      "status": "COMPLETED",
      "note": "Splitting rent"
    },
    "newBalance": "500.00000000",
    "replayed": false
  }
}
```

**Error Response — 402:**

```json
{
  "error": {
    "code": "INSUFFICIENT_FUNDS",
    "message": "You do not have enough balance for this transfer"
  }
}
```

Amounts are sent as decimal strings with up to 8 decimal places (for example `"500.00"`). A few other error codes worth knowing:

| Code | Status | When it happens |
|---|---|---|
| `VALIDATION_ERROR` | 422 | The request body is missing fields or has an invalid amount |
| `CURRENCY_MISMATCH` | 422 | The two accounts use different currencies |
| `IDEMPOTENCY_CONFLICT` | 409 | An `Idempotency-Key` is reused for a different request |

---

## 🔑 Key Technical Decisions

### Why `NUMERIC(20,8)` and not `FLOAT`?

IEEE 754 floating point cannot represent `0.1` exactly in binary. `0.1 + 0.2` in JavaScript gives `0.30000000000000004`. Over thousands of transactions, this error compounds into real money loss. `NUMERIC(20,8)` stores exact decimal values — the usual choice for storing money.

The same rule applies inside the code. Amounts never go through `parseFloat`: the service turns them into whole units of 10⁻⁸ with `BigInt`, does the maths on those, and writes the result back as an exact decimal string. Anything with more than 8 decimal places, or too large for `NUMERIC(20,8)`, is rejected before touching the database.

### Why `SELECT FOR UPDATE`?

Without locking, two concurrent transfers can both read the same balance simultaneously and both think there is enough money — causing an overdraft.

```sql
SELECT * FROM accounts
WHERE id IN (?, ?)
ORDER BY id        -- always lock in same order to prevent deadlock
FOR UPDATE         -- lock rows until transaction commits
```

`ORDER BY id` is critical. If Transfer A locks account 1 then waits for account 2, while Transfer B locks account 2 then waits for account 1, both wait forever — a deadlock. Sorting by ID means both transfers always try to lock the lower UUID first, so one waits safely behind the other.

Requests that carry an idempotency key take one extra lock first: a transaction-scoped PostgreSQL advisory lock on the key itself. After that they lock the accounts in the same `ORDER BY id` order as everything else.

### Why idempotency keys in PostgreSQL (not Redis)?

A user's network can drop after the server processes a transfer but before the client receives the response. The client retries — without idempotency, money is sent twice.

We store a client-generated UUID as a `UNIQUE` column on transactions. When a request comes in with a key, the service first takes an advisory lock on that key, so two identical requests arriving at the same moment are handled one after the other instead of racing. It then checks that the account belongs to the caller, and only after that looks for an earlier transaction with the same key. If it finds one, it returns the original result, including the balance recorded at the time. If the same key shows up with a different amount, account or note, the request is rejected with `409`. The `UNIQUE` constraint in PostgreSQL is still the final safety net — even if application code has a bug, the database rejects duplicates. No Redis needed. Pure PostgreSQL. Simple and reliable.

### Why double‑entry bookkeeping?

Every transfer creates two ledger entries:
- `DEBIT` for the sender — money left their account
- `CREDIT` for the receiver — money arrived in their account

Deposits create a single `CREDIT` entry, since that money comes from outside the system.

The `balance_after` column stores a snapshot of the exact balance at that moment in time. This makes reconciliation possible and gives a complete audit trail: the app only ever adds ledger rows and never edits or deletes them. It's the same double-entry idea accountants have relied on for centuries.

---

## 🔍 Reconciliation

The reconciliation service runs 3 SQL integrity checks in parallel. They only look at accounts that belong to the logged-in user (and transfers involving them), so one user never sees another user's balances:

1. **Balance vs ledger sum**: For every account, sum all `CREDIT` entries and subtract all `DEBIT` entries. Compare to the stored `balance` column. Any difference at all, down to the smallest unit (`0.00000001`), means money appeared or disappeared without a record.
2. **Every transfer is recorded properly**: Each completed `TRANSFER` must have exactly one `DEBIT` from the sender and one `CREDIT` to the receiver, each for the full amount. A missing, extra or misdirected entry means the double‑entry bookkeeping is broken.
3. **Stuck PENDING transactions**: Any transaction stuck in `PENDING` status older than 5 minutes means a transfer started but never completed — usually from a server crash mid-transfer. Any such transaction marks the report as unhealthy.

A healthy system returns zero results from all three checks.

---

## 🧪 Integration Tests

The suite started with 3 critical tests covering the core financial logic and has grown to 24 Jest tests. 8 of them run against a real PostgreSQL database; the other 16 are quick unit checks for edge cases. The whole suite finishes in about a second on a local database.

```
 PASS  src/tests/transactions.test.js
  Transfer Logic
    ✓ successfully moves money and creates ledger entries
    ✓ fails with INSUFFICIENT_FUNDS when balance too low
    ✓ duplicate idempotency key replays original response without double charging
    ✓ simultaneous duplicate requests all replay one committed transfer
    ✓ opposite-direction transfers complete and conserve balances
    ✓ deposit completes and concurrent duplicates create one credit
    ✓ reconciliation is scoped to the caller and catches a missing transfer ledger
    ✓ a ledger-write failure rolls back already updated balances and transaction
 PASS  src/tests/transaction-regressions.test.js   (14 tests)
 PASS  src/tests/reconciliation-unit.test.js       (2 tests)

Test Suites: 3 passed, 3 total
Tests:       24 passed, 24 total
```

<img width="1020" height="661" alt="image" src="https://github.com/user-attachments/assets/fed3f327-9607-43bb-8525-d112c5aaae2e" />

*Screenshot from the first version of the suite, when it had 3 tests.*


- **Test A — Successful transfer**: Verifies money moves atomically, sender balance decreases, receiver balance increases, and exactly 2 ledger entries (`DEBIT` + `CREDIT`) are created with correct `balance_after` snapshots.
- **Test B — Insufficient funds rollback**: Proves that when a transfer fails, the entire `db.transaction()` rolls back — both balances remain completely unchanged. No partial updates. No transaction record created.
- **Test C — Idempotency deduplication**: Sends the same `Idempotency-Key` twice, asserts both calls return the same transaction ID, money is only deducted once, and only one row exists in the `transactions` table.
- **Test D — Simultaneous duplicates**: Fires the same request 10 times at once. Exactly one transfer is committed and every call gets the same result back.
- **Test E — Opposite-direction transfers**: A → B and B → A at the same time both finish, and the total money in the system is unchanged.
- **Test F — Deposits**: A deposit succeeds, and duplicate deposits sent together create only one credit.
- **Test G — Reconciliation scope**: One user's report never includes another user's accounts, and a transfer with a missing ledger entry gets flagged.
- **Test H — Failure halfway through**: If writing a ledger entry fails, the balance updates and the transaction record are rolled back too.
- **Unit checks**: invalid amounts (`NaN`, `Infinity`, `1abc`, zero, negative, too many decimals, too large), ownership checked before a replay, a reused key with a different amount (`409`), replays returning the original balance, cross-currency transfers, balance overflow, an unscoped reconciliation request, and overdue pending transactions.

Run tests:

```bash
cp .env.test.example .env.test   # point it at a throwaway test database
npm run migrate:test
npm test                         # full suite (needs PostgreSQL)
npm run test:unit                # quick unit checks only
```

> ⚠️ The integration tests empty the `users`, `accounts`, `transactions` and `ledger_entries` tables before they run, so only point them at a database you don't mind wiping. In test mode the app ignores `DATABASE_URL` and uses the `DB_*` settings instead.

GitHub Actions runs the same suite against PostgreSQL 16 on every push.

---

## ⚡ Load Test Results

20 concurrent transfers fired simultaneously from one account. `SELECT FOR UPDATE` ensures all transfers serialize correctly in the database engine. Zero money created or destroyed across all 20 transfers.

```
Testing SELECT FOR UPDATE concurrency safety

Registered anish. Account ID: 726129c4-668a-4209-b964-f42a1428a407
Registered rahul. Account ID: 206ac072-f4c5-4c8f-80d8-a278db0a580f
Deposited 10000 into anish account

Firing 20 concurrent transfers of 100 rupees each...

=== RESULTS ===
Duration:           54ms
Successful:         20 / 20
Failed:             0 / 20

=== BALANCE VERIFICATION ===
Anish final balance:  8000
Rahul final balance:  2000
Total money in system: 10000

=== ASSERTIONS ===
PASS - Total money conserved: 10000 === 10000
PASS - Anish balance correct: 8000
PASS - Rahul balance correct: 2000
PASS - No negative balances

=== RECONCILIATION CHECK ===
PASS - Reconciliation passed. Ledger is balanced.

=== LOAD TEST COMPLETE ===
```

<img width="518" height="352" alt="image" src="https://github.com/user-attachments/assets/9247564f-7b4b-4a3a-b4b2-b6f8370776f8" />


This was a single run on my own machine, so treat the 54 ms as a rough figure rather than a benchmark.

Run load test locally:

```bash
node loadtest.js
```

---

## 🚀 Local Setup

### Prerequisites

- Node.js 18+
- Docker (for local PostgreSQL, optional)
- PostgreSQL (if running locally)

### Backend

1. **Clone the repo & install dependencies**

   ```bash
   git clone https://github.com/Anish033-coder/Transactional_Ledger_System.git
   cd Transactional_Ledger_System/backend
   npm install
   ```

2. **Boot up Local Docker Database**

   Start an isolated PostgreSQL container with separate databases for development and tests:

   ```bash
   docker run --name ledger-db -e POSTGRES_PASSWORD=secret -p 5432:5432 -d postgres:16
   docker exec ledger-db createdb -U postgres ledger_dev
   docker exec ledger-db createdb -U postgres ledger_test
   ```

3. **Configure Environment**

   ```bash
   cp .env.example .env
   ```

   Open `.env` and fill in your local DB credentials:

   ```
   NODE_ENV=development
   PORT=3001
   JWT_SECRET=any-long-random-string-here
   DB_HOST=127.0.0.1
   DB_PORT=5432
   DB_USER=postgres
   DB_PASSWORD=secret
   DB_NAME=ledger_dev
   ```

   For tests, copy `.env.test.example` to `.env.test` and point it at `ledger_test`.

4. **Run migrations & start server**

   ```bash
   npm run migrate      # development database
   npm run dev
   ```

   Server runs at http://localhost:3001  
   Health check: http://localhost:3001/health

5. **Run Tests**

   ```bash
   npm run migrate:test
   npm test
   node loadtest.js     # needs the dev server running
   ```

### Frontend

1. **Navigate and install dependencies**

   ```bash
   cd ../frontend
   npm install
   ```

2. **Configure Environment & Start**

   ```bash
   echo "VITE_API_URL=http://localhost:3001/api/v1" > .env
   npm run dev
   ```

   `frontend/.env.example` shows the same setting.

   Frontend runs at http://localhost:5173

---

## 📁 Project Structure

```
Transactional_Ledger_System/
├── README.md
├── render.yaml
├── .github/
│   └── workflows/
│       └── checks.yml
├── backend/
│   ├── src/
│   │   ├── db/
│   │   │   ├── migrations/
│   │   │   │   ├── 1_create_users.js
│   │   │   │   ├── 2_create_accounts.js
│   │   │   │   ├── 3_create_transactions.js
│   │   │   │   ├── 4_add_idempotency_key.js
│   │   │   │   └── 5_create_ledger_entries.js
│   │   │   └── db.js
│   │   ├── middleware/
│   │   │   └── auth.js
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── accounts.js
│   │   │   ├── transactions.js
│   │   │   └── reconciliation.js
│   │   ├── services/
│   │   │   ├── AuthService.js
│   │   │   ├── TransactionService.js
│   │   │   └── ReconciliationService.js
│   │   ├── tests/
│   │   │   ├── setup.js
│   │   │   ├── transactions.test.js
│   │   │   ├── transaction-regressions.test.js
│   │   │   └── reconciliation-unit.test.js
│   │   └── index.js
│   ├── loadtest.js
│   ├── knexfile.js
│   ├── jest.config.js
│   ├── package.json
│   ├── .env.example
│   ├── .env.test.example
│   └── .gitignore
└── frontend/
    ├── src/
    │   ├── lib/
    │   │   └── api.js
    │   ├── context/
    │   │   └── AuthContext.jsx
    │   ├── components/
    │   │   ├── Navbar.jsx
    │   │   ├── ProtectedRoute.jsx
    │   │   ├── BalanceCard.jsx
    │   │   ├── TransferModal.jsx
    │   │   └── TransactionTable.jsx
    │   ├── pages/
    │   │   ├── Login.jsx
    │   │   ├── Register.jsx
    │   │   ├── Dashboard.jsx
    │   │   ├── Transactions.jsx
    │   │   └── History.jsx
    │   ├── App.jsx
    │   ├── index.css
    │   └── main.jsx
    ├── index.html
    ├── package.json
    ├── postcss.config.js
    ├── tailwind.config.js
    ├── .env
    ├── .env.example
    └── .gitignore
```

---

## 🚢 Deployment

**Backend** deployed on Render from [`render.yaml`](render.yaml), with PostgreSQL on Neon.  
The start command runs migrations automatically on every deploy:

```bash
npm run start:prod   # knex migrate:latest --env production && node src/index.js
```

To deploy your own copy: create a Neon database, then in Render choose **New → Blueprint**, pick this repo, and paste the Neon connection string as `DATABASE_URL`. Render generates `JWT_SECRET` itself.

**Frontend** deployed on Vercel with `VITE_API_URL` pointing to the Render backend.

Both platforms auto-deploy on every push to the main branch. Zero manual steps after initial setup. GitHub Actions also runs the test suite on every push.

---

## ⚠️ Known Limitations

These are intentional tradeoffs, not bugs:


- **In‑memory rate limiter** — Resets on server restart. Multi‑instance deployments need a Redis store.
- **No refresh token** — Users must log in again after 7 days.
- **JWT in localStorage** — XSS risk. Production systems should use HTTP‑only cookies.

A few more things worth being upfront about:

- **Simulated money only** — deposits are demo credits with no payment gateway or settlement account behind them, so a deposit has a `CREDIT` entry without a matching `DEBIT`.
- **No currency conversion** — accounts in different currencies can't transfer to each other.
- **Idempotency keys are global** — generate a fresh UUID for every new operation and reuse it only when retrying that same operation.
- **Reconciliation isn't one snapshot** — the three checks are separate queries, so a transfer that commits in between can show up in one check and not another.
- **Dependency updates pending** — `npm audit` currently reports advisories in a few packages (such as `body-parser` and `ip-address`) that still need upgrading.

---

## 📚 What I Learned Building This

- How PostgreSQL database transactions work and why atomicity matters for financial systems.
- The difference between `FLOAT` and `NUMERIC` and why it is critical for money storage.
- How `SELECT FOR UPDATE` prevents race conditions in concurrent database writes.
- How deadlocks occur and why ordering lock acquisition by ID prevents them.
- How idempotency keys prevent duplicate charges under network retry scenarios.
- How double‑entry bookkeeping creates a complete immutable audit trail.
- How to write integration tests for financial logic using Jest.
- How to keep money exact in JavaScript by doing the maths in `BigInt` units instead of floats.
- How a PostgreSQL advisory lock stops two identical requests from racing each other.
- Why ownership has to be checked before replaying a stored response, not after.
- How writing a failing test first makes a bug fix much easier to trust.
- How to structure a Node.js backend with clean separation of concerns.
- How to deploy a backend with a managed database and automatic migrations on every deploy.
- How to build and deploy a React frontend with Vite and Tailwind on Vercel.

---

## 👤 Author

**Anish Kumawat**  
3rd Year CSE — IIIT Lucknow

---

## 📄 License

MIT — free to use and modify.
