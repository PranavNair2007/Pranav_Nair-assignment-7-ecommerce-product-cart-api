'use strict';

/**
 * End-to-end flow test using Node's built-in http against the real Express app.
 * No external test framework required.
 *
 * Flow: register -> login -> browse/filter/sort -> add to cart (incl. an
 * over-stock 400) -> verify totals -> checkout -> verify stock decremented and
 * cart cleared. Also checks that a snapshot of the data files is restored so
 * running the test does not permanently mutate the shipped seed data.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const app = require('../server');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILES = ['products.json', 'users.json', 'carts.json'];

// Snapshot seed data so the test is repeatable and non-destructive.
const snapshots = {};
FILES.forEach((f) => {
  snapshots[f] = fs.readFileSync(path.join(DATA_DIR, f), 'utf-8');
});
function restore() {
  FILES.forEach((f) => fs.writeFileSync(path.join(DATA_DIR, f), snapshots[f]));
}

let server;
let cookie = '';

function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const { port } = server.address();
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: urlPath,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(cookie ? { Cookie: cookie } : {}),
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          if (res.headers['set-cookie']) {
            cookie = res.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ');
          }
          let parsed;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

let passed = 0;
function check(name, cond) {
  assert.ok(cond, `FAILED: ${name}`);
  passed += 1;
  console.log(`  ok - ${name}`);
}

async function run() {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));

  console.log('AUTH');
  let res = await request('POST', '/api/auth/register', {
    username: 'alice',
    email: 'alice@example.com',
    password: 'secret123',
  });
  check('register returns 201', res.status === 201);
  check('register does not leak password', res.body.data && res.body.data.password === undefined);

  res = await request('POST', '/api/auth/register', {
    username: 'alice2',
    email: 'alice@example.com',
    password: 'x',
  });
  check('duplicate email returns 400', res.status === 400);

  res = await request('POST', '/api/auth/register', { username: 'bob' });
  check('missing fields returns 400', res.status === 400);

  // Cart must be blocked before login.
  res = await request('GET', '/api/cart');
  check('cart blocked without auth returns 401', res.status === 401);

  res = await request('POST', '/api/auth/login', {
    email: 'alice@example.com',
    password: 'wrong',
  });
  check('bad password returns 401', res.status === 401);

  res = await request('POST', '/api/auth/login', {
    email: 'alice@example.com',
    password: 'secret123',
  });
  check('login returns 200', res.status === 200);

  console.log('PRODUCTS / FILTER / SORT');
  res = await request('GET', '/api/products');
  const total = res.body.data.length;
  check('list all products', res.status === 200 && total >= 5);

  res = await request('GET', '/api/products?category=electronics');
  check(
    'filter by category=electronics',
    res.body.data.length > 0 && res.body.data.every((p) => p.category === 'electronics')
  );

  res = await request('GET', '/api/products?minPrice=40&maxPrice=120');
  check(
    'filter by price range 40-120',
    res.body.data.every((p) => p.price >= 40 && p.price <= 120)
  );

  res = await request('GET', '/api/products?category=apparel&maxPrice=100');
  check(
    'combined AND filter (apparel + maxPrice)',
    res.body.data.every((p) => p.category === 'apparel' && p.price <= 100)
  );

  res = await request('GET', '/api/products?sort=price_asc');
  let prices = res.body.data.map((p) => p.price);
  check('sort price_asc', prices.every((v, i) => i === 0 || prices[i - 1] <= v));

  res = await request('GET', '/api/products?sort=price_desc');
  prices = res.body.data.map((p) => p.price);
  check('sort price_desc', prices.every((v, i) => i === 0 || prices[i - 1] >= v));

  res = await request('GET', '/api/products?sort=rating_desc');
  const ratings = res.body.data.map((p) => p.rating);
  check('sort rating_desc', ratings.every((v, i) => i === 0 || ratings[i - 1] >= v));

  res = await request('GET', '/api/products?sort=newest');
  const dates = res.body.data.map((p) => new Date(p.createdAt).getTime());
  check('sort newest', dates.every((v, i) => i === 0 || dates[i - 1] >= v));

  res = await request('GET', '/api/products/prod_999');
  check('unknown product returns 404', res.status === 404);

  console.log('CART');
  // prod_101 stock 25, prod_105 stock 12, prod_103 stock 0
  res = await request('POST', '/api/cart/items', { productId: 'prod_101', quantity: 2 });
  check('add prod_101 x2', res.status === 200);

  res = await request('POST', '/api/cart/items', { productId: 'prod_101', quantity: 3 });
  check('add prod_101 again merges quantity', res.status === 200);
  const line101 = res.body.data.items.find((i) => i.productId === 'prod_101');
  check('merged quantity is 5', line101.quantity === 5);
  check('itemTotal recalculated', line101.itemTotal === Math.round(line101.unitPrice * 5 * 100) / 100);

  res = await request('POST', '/api/cart/items', { productId: 'prod_103', quantity: 1 });
  check('over-stock (stock 0) returns 400 Insufficient stock', res.status === 400 && res.body.message === 'Insufficient stock');

  res = await request('POST', '/api/cart/items', { productId: 'prod_105', quantity: 2 });
  check('add prod_105 x2', res.status === 200);

  res = await request('GET', '/api/cart');
  const cart = res.body.data;
  const expectedTotal =
    Math.round((line101.unitPrice * 5 + cart.items.find((i) => i.productId === 'prod_105').unitPrice * 2) * 100) / 100;
  check('cartTotal correct', cart.cartTotal === expectedTotal);

  res = await request('DELETE', '/api/cart/items/prod_999');
  check('remove absent item returns 404 Not in Cart', res.status === 404 && res.body.message === 'Not in Cart');

  console.log('CHECKOUT + STOCK DECREMENT');
  // Capture stock before checkout.
  const before = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'products.json'), 'utf-8'));
  const stock101Before = before.find((p) => p.id === 'prod_101').stock;
  const stock105Before = before.find((p) => p.id === 'prod_105').stock;

  res = await request('POST', '/api/cart/checkout');
  check('checkout returns 200', res.status === 200);
  check('order summary has total & timestamp', typeof res.body.data.total === 'number' && !!res.body.data.timestamp);

  const after = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'products.json'), 'utf-8'));
  const stock101After = after.find((p) => p.id === 'prod_101').stock;
  const stock105After = after.find((p) => p.id === 'prod_105').stock;
  check('prod_101 stock decremented by 5', stock101After === stock101Before - 5);
  check('prod_105 stock decremented by 2', stock105After === stock105Before - 2);

  res = await request('GET', '/api/cart');
  check('cart cleared after checkout', res.body.data.items.length === 0 && res.body.data.cartTotal === 0);

  res = await request('POST', '/api/cart/checkout');
  check('checkout empty cart returns 400 Empty Cart', res.status === 400 && res.body.message === 'Empty Cart');

  console.log('LOGOUT');
  res = await request('POST', '/api/auth/logout');
  check('logout returns 200', res.status === 200);
  res = await request('GET', '/api/cart');
  check('cart blocked again after logout', res.status === 401);
}

run()
  .then(() => {
    console.log(`\nAll ${passed} checks passed.`);
  })
  .catch((err) => {
    console.error('\n' + err.message);
    process.exitCode = 1;
  })
  .finally(() => {
    if (server) server.close();
    restore();
    console.log('Seed data restored.');
  });
