const jwt = require('jsonwebtoken');
const { logger } = require('@librechat/data-schemas');

/**
 * Authenticate WebSocket connection using JWT token
 * @param {string} token - JWT token from query string
 * @returns {Promise<Object>} - Authenticated user object
 */
async function authenticateWebSocket(token) {
  try {
    if (!token) {
      throw new Error('No token provided');
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (!decoded.id) {
      throw new Error('Invalid token payload');
    }

    // Return minimal user object for WebSocket connections
    return {
      id: decoded.id,
      username: decoded.username,
      email: decoded.email,
      role: decoded.role
    };
  } catch (error) {
    logger.error('WebSocket authentication error:', error);
    throw new Error('Authentication failed');
  }
}

module.exports = {
  authenticateWebSocket
};
