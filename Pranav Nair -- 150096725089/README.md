# E-Commerce Product & Shopping Cart API

A production-structured REST API for a small e-commerce store: a product
catalog with filtering/sorting, session-based authentication, and a per-user
shopping cart with server-side stock control and checkout.

Built with **Node.js + Express**, persisting to **JSON files** via
`fs/promises` (no database). Auth is **session cookie** based
(`express-session`), not JWT.

---

## Tech stack

| Concern        | Choice                                   |
| -------------- | ---------------------------------------- |
| Runtime        | Node.js                                  |
| HTTP framework | Express.js                               |
| Persistence    | JSON files under `data/` (`fs/promises`) |
| Passwords      | `bcryptjs` (hashed, never stored plain)  |
| Sessions       | `express-session` (cookie)               |
| Config         | `dotenv`                                 |
| IDs            | `uuid` (short suffix)                    |
| Dev            | `nodemon`                                |

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Create your env file from the template
cp .env.example .env
#   PORT           - server port (default 3000)
#   SESSION_SECRET - secret used to sign the session cookie

# 3. Run
npm run dev      # development, auto-reload via nodemon
# or
npm start        # plain node
```

The API listens on `http://localhost:3000` by default.

### Seed data ships ready to test

`data/products.json` is committed with **6 products across 3 categories**
(`electronics`, `home`, `apparel`) at varied prices, ratings, and stock levels —
including `prod_103` with **stock 0** and `prod_102` with **stock 3** so the
insufficient-stock path is easy to exercise. `data/users.json` and
`data/carts.json` ship as empty arrays. No seeding step is required; clone,
`npm install`, and run.

---

## Running the tests

An end-to-end flow test (no external framework — plain Node `http` + `assert`)
drives the whole app. It snapshots the data files first and restores them
afterward, so it does **not** permanently mutate the shipped seed data.

```bash
npm test
```

It covers: register → login → browse/filter/sort → add to cart (including an
over-stock attempt that must return 400) → verify totals → checkout → verify
product stock decremented and cart cleared → logout. 32 assertions.

---

## Authentication (session cookie)

- `POST /api/auth/login` verifies the bcrypt hash and stores
  `req.session.user = { id, username, email }`. Express-session issues a signed
  `connect.sid` cookie.
- Subsequent requests must send that cookie. In a browser this is automatic;
  with `curl` use a cookie jar (`-c cookies.txt -b cookies.txt`); in Postman
  enable cookie handling.
- `authGuard` middleware protects every `/api/cart` route and returns `401` if
  no session user is present.
- `POST /api/auth/logout` destroys the session and clears the cookie.

Passwords are hashed with bcrypt on registration and **never persisted or
returned in plaintext** — user responses omit the password field entirely.

---

## Response shape

Every response uses a consistent JSON envelope:

```json
{ "success": true, "message": "…", "data": { } }
```

Errors flow through a centralized error-handling middleware and use the same
shape with `success: false`.

---

## Endpoints

### Auth — `/api/auth`

| Method | Path        | Body                            | Success | Errors                                  |
| ------ | ----------- | ------------------------------- | ------- | --------------------------------------- |
| POST   | `/register` | `{ username, email, password }` | 201     | 400 missing fields / duplicate email    |
| POST   | `/login`    | `{ email, password }`           | 200     | 400 missing fields, 401 bad credentials |
| POST   | `/logout`   | —                               | 200     | —                                       |

### Products — `/api/products`

| Method | Path   | Notes                                            | Success | Errors        |
| ------ | ------ | ------------------------------------------------ | ------- | ------------- |
| GET    | `/`    | Filter/sort via query params (see below)         | 200     | —             |
| GET    | `/:id` | Single product                                   | 200     | 404 not found |
| POST   | `/`    | Create; `price > 0`, `stock >= 0`                | 201     | 400 invalid   |
| PUT    | `/:id` | Partial update (`price` and/or `stock`)          | 200     | 400 / 404     |
| DELETE | `/:id` | Delete                                           | 200     | 404 not found |

**Query params on `GET /api/products`** (combined with **AND**):

- `category` — exact match, case-insensitive
- `minPrice` — `price >= minPrice`
- `maxPrice` — `price <= maxPrice`
- `sort` — one of `price_asc`, `price_desc`, `rating_desc`, `newest`

Example: `/api/products?category=electronics&maxPrice=100&sort=price_asc`

### Cart — `/api/cart` (all require an authenticated session)

| Method | Path                 | Body                      | Success | Errors                              |
| ------ | -------------------- | ------------------------- | ------- | ----------------------------------- |
| GET    | `/`                  | —                         | 200     | 401                                 |
| POST   | `/items`             | `{ productId, quantity }` | 200     | 400 Insufficient stock, 404, 401    |
| DELETE | `/items/:productId`  | —                         | 200     | 404 Not in Cart, 401                |
| POST   | `/checkout`          | —                         | 200     | 400 Empty Cart / insufficient, 401  |

Cart behavior:

- Adding a product already in the cart **increases its quantity** rather than
  creating a duplicate line item.
- Requested quantity is checked against **live product stock**; if unavailable
  the response is `400 { message: "Insufficient stock" }`. Stock is **not**
  decremented when adding — only at checkout.
- `itemTotal` and `cartTotal` are always **recomputed server-side** and never
  trusted from the client.
- Checkout re-validates stock for every line (handling the race where stock
  changed after the item was added). If any line can no longer be fulfilled the
  whole checkout fails with 400 and nothing is committed. On success it
  decrements product stock, clears the cart, and returns an order summary
  (`items`, `total`, `timestamp`).

---

## Data schemas

**products.json**

```json
{ "id": "prod_101", "name": "…", "category": "electronics",
  "price": 129.99, "stock": 25, "rating": 4.6,
  "createdAt": "2026-01-10T09:00:00.000Z" }
```

**users.json** (password is a bcrypt hash; never returned)

```json
{ "id": "usr_ab12cd34", "username": "…", "email": "…",
  "password": "$2a$…", "createdAt": "…" }
```

**carts.json** (one document per user)

```json
{ "userId": "usr_…",
  "items": [{ "productId": "prod_101", "name": "…", "unitPrice": 129.99,
              "quantity": 2, "itemTotal": 259.98 }],
  "cartTotal": 259.98, "updatedAt": "…" }
```

---

## Project structure

```
assignment-07-ecommerce-api/
├── data/                 # JSON persistence layer (committed, with seed data)
│   ├── products.json
│   ├── users.json
│   └── carts.json
├── controllers/          # request handlers
│   ├── authController.js
│   ├── cartController.js
│   └── productController.js
├── middleware/
│   ├── authGuard.js      # 401s unauthenticated cart access
│   ├── logger.js         # method, path, status, response time
│   └── validateProduct.js# price > 0, stock >= 0
├── routes/
│   ├── authRoutes.js
│   ├── cartRoutes.js
│   └── productRoutes.js
├── utils/
│   └── fileHelper.js     # readData / writeData — the ONLY fs access
├── test/
│   └── flow.test.js      # end-to-end flow test
├── .env.example
├── .gitignore
├── package.json
├── server.js
└── README.md
```

---

## Design choices

These were decided during implementation and are documented here per the brief.

1. **All persistence goes through `utils/fileHelper.js`.** `readData` returns
   `[]` on any read/parse error (missing file, corrupt JSON) so the app is
   resilient to a fresh or damaged store. No controller touches `fs` directly.

2. **Concurrent-write safety via an in-memory per-filename queue.** Each
   `writeData(file, …)` is chained onto the previous write for that same file,
   so overlapping requests cannot interleave their writes and corrupt the JSON.
   This is a lightweight mutex appropriate for a single-process file store.

3. **Session auth, not JWT** (per the brief). The session stores only
   `{ id, username, email }`. Cookie is `httpOnly` with a 1-hour lifetime.

4. **Money is rounded to 2 decimals** on every calculation (`itemTotal`,
   `cartTotal`, order total) to avoid floating-point drift. Totals are always
   recomputed server-side from `unitPrice * quantity`.

5. **Stock is reserved at checkout, not at add-to-cart.** Adding validates
   against live stock but does not decrement, matching real cart semantics
   (items in a cart are not yet purchased). Checkout re-validates and commits
   atomically (all-or-nothing) to handle the race where stock dropped in
   between.

6. **Add-to-cart merges quantities** for an existing product and refreshes the
   line's `unitPrice`/`name` to the current product values, so a cart never
   holds a stale price silently across a price change made before checkout.

7. **Product create vs. update validation** is distinguished by HTTP method in
   `validateProduct`: `POST` requires `name`, `category`, `price`, `stock`;
   `PUT` validates only the fields provided (partial update).

8. **IDs** use a `uuid` short suffix (`prod_` / `usr_` prefixes) for readable,
   collision-resistant identifiers without a database sequence.

9. **`data/*.json` is committed** (excluded from `.gitignore`) because the JSON
   files *are* the persistence layer and carry the seed data needed to run and
   test immediately. Only `node_modules/` and `.env` are ignored.

10. **Health-check root route** `GET /` returns a small descriptor, and the app
    is exported from `server.js` (only calling `listen` when run directly) so
    the test harness can import it without binding a fixed port.


    ---

## Author

## PRANAV NAIR
## 150096725089
## SAM ALTMAN 
