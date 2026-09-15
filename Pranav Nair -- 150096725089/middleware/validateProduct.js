'use strict';

/**
 * Validates product create/update payloads.
 *
 * Rules enforced (only for fields that are present):
 *   - price must be a number > 0
 *   - stock must be a number >= 0 (integer)
 *
 * On create (POST) name and category are also required. We detect create vs
 * update by HTTP method: POST => create (name/category/price/stock required),
 * PUT => partial update (validate only provided fields).
 */
function validateProduct(req, res, next) {
  const isCreate = req.method === 'POST';
  const body = req.body || {};
  const errors = [];

  if (isCreate) {
    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      errors.push('name is required');
    }
    if (!body.category || typeof body.category !== 'string' || !body.category.trim()) {
      errors.push('category is required');
    }
    if (body.price === undefined) errors.push('price is required');
    if (body.stock === undefined) errors.push('stock is required');
  }

  if (body.price !== undefined) {
    const price = Number(body.price);
    if (!Number.isFinite(price) || price <= 0) {
      errors.push('price must be a number greater than 0');
    }
  }

  if (body.stock !== undefined) {
    const stock = Number(body.stock);
    if (!Number.isInteger(stock) || stock < 0) {
      errors.push('stock must be an integer greater than or equal to 0');
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: `Validation failed: ${errors.join(', ')}`,
    });
  }

  next();
}

module.exports = validateProduct;
