// asyncHandler.js
// Wraps an async route handler so any rejected promise is forwarded to the
// Express error-handling middleware instead of crashing/hanging the request.

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;
