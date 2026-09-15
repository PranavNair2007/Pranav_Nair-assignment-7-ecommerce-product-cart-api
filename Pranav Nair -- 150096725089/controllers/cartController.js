'use strict';

const { readData, writeData } = require('../utils/fileHelper');

const CARTS_FILE = 'carts.json';
const PRODUCTS_FILE = 'products.json';

/** Round to 2 decimals to avoid floating-point drift in money math. */
function money(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Recompute itemTotal for every line and the cart total. Mutates & returns cart. */
function recalcCart(cart) {
  cart.items.forEach((item) => {
    item.itemTotal = money(item.unitPrice * item.quantity);
  });
  cart.cartTotal = money(cart.items.reduce((sum, i) => sum + i.itemTotal, 0));
  cart.updatedAt = new Date().toISOString();
  return cart;
}

/** Empty-cart shape for a user with no persisted cart. */
function emptyCart(userId) {
  return { userId, items: [], cartTotal: 0, updatedAt: new Date().toISOString() };
}

/** GET /api/cart — current user's cart, totals recalculated fresh. */
async function getCart(req, res, next) {
  try {
    const userId = req.session.user.id;
    const carts = await readData(CARTS_FILE);
    const cart = carts.find((c) => c.userId === userId) || emptyCart(userId);
    recalcCart(cart);

    return res.status(200).json({ success: true, message: 'Cart retrieved', data: cart });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/cart/items
 * Body: { productId, quantity }
 * - Looks up live product stock; 400 "Insufficient stock" if unavailable.
 * - Stock is NOT decremented here (that happens at checkout).
 * - If product already in cart, quantity is increased (no duplicate line).
 */
async function addItem(req, res, next) {
  try {
    const userId = req.session.user.id;
    const { productId, quantity } = req.body || {};
    const qty = Number(quantity);

    if (!productId || !Number.isInteger(qty) || qty <= 0) {
      return res.status(400).json({
        success: false,
        message: 'productId and a positive integer quantity are required',
      });
    }

    const products = await readData(PRODUCTS_FILE);
    const product = products.find((p) => p.id === productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const carts = await readData(CARTS_FILE);
    let cart = carts.find((c) => c.userId === userId);
    if (!cart) {
      cart = emptyCart(userId);
      carts.push(cart);
    }

    const existing = cart.items.find((i) => i.productId === productId);
    const desiredQty = (existing ? existing.quantity : 0) + qty;

    // Compare the resulting total quantity against live stock.
    if (desiredQty > product.stock) {
      return res.status(400).json({ success: false, message: 'Insufficient stock' });
    }

    if (existing) {
      existing.quantity = desiredQty;
      existing.unitPrice = product.price; // refresh to current price
      existing.name = product.name;
    } else {
      cart.items.push({
        productId: product.id,
        name: product.name,
        unitPrice: product.price,
        quantity: qty,
        itemTotal: money(product.price * qty),
      });
    }

    recalcCart(cart);
    await writeData(CARTS_FILE, carts);

    return res.status(200).json({ success: true, message: 'Item added to cart', data: cart });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/cart/items/:productId
 * Removes a line item; 404 "Not in Cart" if absent.
 */
async function removeItem(req, res, next) {
  try {
    const userId = req.session.user.id;
    const { productId } = req.params;

    const carts = await readData(CARTS_FILE);
    const cart = carts.find((c) => c.userId === userId);
    const idx = cart ? cart.items.findIndex((i) => i.productId === productId) : -1;

    if (!cart || idx === -1) {
      return res.status(404).json({ success: false, message: 'Not in Cart' });
    }

    cart.items.splice(idx, 1);
    recalcCart(cart);
    await writeData(CARTS_FILE, carts);

    return res.status(200).json({ success: true, message: 'Item removed from cart', data: cart });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/cart/checkout
 * - 400 "Empty Cart" if no items.
 * - Re-validates live stock per item (handles the race where stock changed
 *   after the item was added). If any item can no longer be fulfilled, 400
 *   and nothing is committed.
 * - Decrements product stock, clears the cart, returns an order summary.
 */
async function checkout(req, res, next) {
  try {
    const userId = req.session.user.id;

    const carts = await readData(CARTS_FILE);
    const cart = carts.find((c) => c.userId === userId);

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: 'Empty Cart' });
    }

    const products = await readData(PRODUCTS_FILE);

    // Re-validate all items BEFORE mutating anything (all-or-nothing).
    for (const item of cart.items) {
      const product = products.find((p) => p.id === item.productId);
      if (!product) {
        return res.status(400).json({
          success: false,
          message: `Product no longer available: ${item.productId}`,
        });
      }
      if (item.quantity > product.stock) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${product.name}`,
        });
      }
    }

    // Commit: decrement stock.
    for (const item of cart.items) {
      const product = products.find((p) => p.id === item.productId);
      product.stock -= item.quantity;
    }
    await writeData(PRODUCTS_FILE, products);

    recalcCart(cart);
    const order = {
      userId,
      items: cart.items.map((i) => ({
        productId: i.productId,
        name: i.name,
        unitPrice: i.unitPrice,
        quantity: i.quantity,
        itemTotal: i.itemTotal,
      })),
      total: cart.cartTotal,
      timestamp: new Date().toISOString(),
    };

    // Clear the user's cart.
    cart.items = [];
    recalcCart(cart);
    await writeData(CARTS_FILE, carts);

    return res.status(200).json({
      success: true,
      message: 'Checkout complete',
      data: order,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getCart, addItem, removeItem, checkout };
