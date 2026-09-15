'use strict';

const { v4: uuidv4 } = require('uuid');
const { readData, writeData } = require('../utils/fileHelper');

const PRODUCTS_FILE = 'products.json';

/**
 * GET /api/products
 * Query params (all optional, combined with AND):
 *   category  - exact category match (case-insensitive)
 *   minPrice  - price >= minPrice
 *   maxPrice  - price <= maxPrice
 *   sort      - price_asc | price_desc | rating_desc | newest
 */
async function listProducts(req, res, next) {
  try {
    let products = await readData(PRODUCTS_FILE);
    const { category, minPrice, maxPrice, sort } = req.query;

    if (category) {
      const c = String(category).toLowerCase();
      products = products.filter((p) => p.category.toLowerCase() === c);
    }
    if (minPrice !== undefined && minPrice !== '') {
      const min = Number(minPrice);
      if (Number.isFinite(min)) products = products.filter((p) => p.price >= min);
    }
    if (maxPrice !== undefined && maxPrice !== '') {
      const max = Number(maxPrice);
      if (Number.isFinite(max)) products = products.filter((p) => p.price <= max);
    }

    switch (sort) {
      case 'price_asc':
        products.sort((a, b) => a.price - b.price);
        break;
      case 'price_desc':
        products.sort((a, b) => b.price - a.price);
        break;
      case 'rating_desc':
        products.sort((a, b) => b.rating - a.rating);
        break;
      case 'newest':
        products.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        break;
      default:
        break;
    }

    return res.status(200).json({
      success: true,
      message: 'Products retrieved',
      data: products,
    });
  } catch (err) {
    next(err);
  }
}

/** GET /api/products/:id — 404 if not found. */
async function getProduct(req, res, next) {
  try {
    const products = await readData(PRODUCTS_FILE);
    const product = products.find((p) => p.id === req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    return res.status(200).json({ success: true, message: 'Product retrieved', data: product });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/products — create.
 * Validation handled upstream by validateProduct middleware.
 */
async function createProduct(req, res, next) {
  try {
    const { name, category, price, stock, rating } = req.body;
    const products = await readData(PRODUCTS_FILE);

    const newProduct = {
      id: 'prod_' + uuidv4().slice(0, 8),
      name: String(name).trim(),
      category: String(category).trim(),
      price: Number(price),
      stock: Number(stock),
      rating: rating !== undefined ? Number(rating) : 0,
      createdAt: new Date().toISOString(),
    };

    products.push(newProduct);
    await writeData(PRODUCTS_FILE, products);

    return res.status(201).json({
      success: true,
      message: 'Product created',
      data: newProduct,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/products/:id — partial update (price and/or stock).
 * Validation handled upstream by validateProduct middleware.
 */
async function updateProduct(req, res, next) {
  try {
    const products = await readData(PRODUCTS_FILE);
    const idx = products.findIndex((p) => p.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const { price, stock } = req.body;
    if (price !== undefined) products[idx].price = Number(price);
    if (stock !== undefined) products[idx].stock = Number(stock);

    await writeData(PRODUCTS_FILE, products);

    return res.status(200).json({
      success: true,
      message: 'Product updated',
      data: products[idx],
    });
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/products/:id — 404 if not found, 200 on success. */
async function deleteProduct(req, res, next) {
  try {
    const products = await readData(PRODUCTS_FILE);
    const idx = products.findIndex((p) => p.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    const [removed] = products.splice(idx, 1);
    await writeData(PRODUCTS_FILE, products);

    return res.status(200).json({
      success: true,
      message: 'Product deleted',
      data: removed,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
};
