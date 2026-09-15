'use strict';

/**
 * Request logger.
 * Logs method, path, status code, and response time (ms) for every request.
 * Hooks the 'finish' event so the status code is final when we log.
 */
function logger(req, res, next) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const ms = Number(end - start) / 1e6;
    console.log(
      `${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`
    );
  });

  next();
}

module.exports = logger;
