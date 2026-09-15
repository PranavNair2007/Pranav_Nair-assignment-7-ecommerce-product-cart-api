'use strict';

/**
 * Blocks a route unless the session carries an authenticated user.
 * Used to protect all /api/cart routes.
 */
function authGuard(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. Please log in.',
    });
  }
  next();
}

module.exports = authGuard;
