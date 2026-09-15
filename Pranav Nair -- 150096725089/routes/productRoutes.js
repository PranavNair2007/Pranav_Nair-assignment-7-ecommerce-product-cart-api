'use strict';

const express = require('express');
const router = express.Router();
const validateProduct = require('../middleware/validateProduct');
const {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
} = require('../controllers/productController');

router.get('/', listProducts);
router.get('/:id', getProduct);
router.post('/', validateProduct, createProduct);
router.put('/:id', validateProduct, updateProduct);
router.delete('/:id', deleteProduct);

module.exports = router;
