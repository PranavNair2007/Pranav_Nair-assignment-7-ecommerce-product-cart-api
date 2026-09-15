'use strict';

const express = require('express');
const router = express.Router();
const authGuard = require('../middleware/authGuard');
const { getCart, addItem, removeItem, checkout } = require('../controllers/cartController');

// Every cart route requires an authenticated session.
router.use(authGuard);

router.get('/', getCart);
router.post('/items', addItem);
router.delete('/items/:productId', removeItem);
router.post('/checkout', checkout);

module.exports = router;
