const WebSocket = require('ws');
const { logger } = require('@librechat/data-schemas');
const { authenticateWebSocket } = require('~/server/middleware/auth');

class UploadProgressManager {
  constructor() {
    this.clients = new Map(); // userId -> Set of WebSocket connections
    this.uploadSessions = new Map(); // fileId -> upload session info
  }

  /**
   * Initialize WebSocket server for upload progress
   * @param {import('http').Server} server - HTTP server instance
   */
  initialize(server) {
    this.wss = new WebSocket.Server({ 
      server,
      path: '/ws/upload-progress',
      verifyClient: this.verifyClient.bind(this)
    });

    this.wss.on('connection', this.handleConnection.bind(this));
    logger.info('Upload Progress WebSocket server initialized');
  }

  /**
   * Verify WebSocket client authentication
   * @param {Object} info - WebSocket connection info
   * @returns {boolean} - Whether client is authenticated
   */
  async verifyClient(info) {
    try {
      const token = info.req.url.split('token=')[1];
      if (!token) return false;
      
      const user = await authenticateWebSocket(token);
      info.req.user = user;
      return !!user;
    } catch (error) {
      logger.error('WebSocket authentication failed:', error);
      return false;
    }
  }

  /**
   * Handle new WebSocket connection
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} req - HTTP request
   */
  handleConnection(ws, req) {
    const userId = req.user.id;
    
    // Add client to user's connection set
    if (!this.clients.has(userId)) {
      this.clients.set(userId, new Set());
    }
    this.clients.get(userId).add(ws);

    // Handle client disconnect
    ws.on('close', () => {
      const userClients = this.clients.get(userId);
      if (userClients) {
        userClients.delete(ws);
        if (userClients.size === 0) {
          this.clients.delete(userId);
        }
      }
    });

    // Handle client messages (for ping/pong)
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        if (data.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      } catch (error) {
        logger.error('Invalid WebSocket message:', error);
      }
    });

    logger.debug(`WebSocket connection established for user ${userId}`);
  }

  /**
   * Start tracking an upload session
   * @param {string} fileId - Unique file identifier
   * @param {string} userId - User ID
   * @param {Object} metadata - Upload metadata
   */
  startUploadSession(fileId, userId, metadata) {
    this.uploadSessions.set(fileId, {
      userId,
      fileId,
      startTime: Date.now(),
      status: 'uploading',
      progress: 0,
      metadata,
      chunks: new Map(), // For chunked uploads
      totalChunks: 0,
      completedChunks: 0
    });

    this.broadcastToUser(userId, {
      type: 'upload_started',
      fileId,
      metadata
    });
  }

  /**
   * Update upload progress
   * @param {string} fileId - File identifier
   * @param {number} progress - Progress percentage (0-1)
   * @param {string} stage - Current processing stage
   * @param {Object} details - Additional progress details
   */
  updateProgress(fileId, progress, stage = 'uploading', details = {}) {
    const session = this.uploadSessions.get(fileId);
    if (!session) return;

    session.progress = Math.min(1, Math.max(0, progress));
    session.stage = stage;
    session.lastUpdate = Date.now();

    this.broadcastToUser(session.userId, {
      type: 'upload_progress',
      fileId,
      progress: session.progress,
      stage,
      details,
      timestamp: session.lastUpdate
    });
  }

  /**
   * Update chunked upload progress
   * @param {string} fileId - File identifier
   * @param {number} chunkIndex - Chunk index
   * @param {number} totalChunks - Total number of chunks
   * @param {boolean} completed - Whether chunk upload completed
   */
  updateChunkProgress(fileId, chunkIndex, totalChunks, completed = false) {
    const session = this.uploadSessions.get(fileId);
    if (!session) return;

    session.totalChunks = totalChunks;
    if (completed) {
      session.completedChunks++;
      session.chunks.set(chunkIndex, true);
    }

    const progress = session.completedChunks / totalChunks;
    this.updateProgress(fileId, progress, 'uploading', {
      completedChunks: session.completedChunks,
      totalChunks,
      chunkIndex
    });
  }

  /**
   * Complete upload session
   * @param {string} fileId - File identifier
   * @param {Object} result - Upload result
   */
  completeUpload(fileId, result) {
    const session = this.uploadSessions.get(fileId);
    if (!session) return;

    session.status = 'completed';
    session.progress = 1;
    session.result = result;
    session.endTime = Date.now();

    this.broadcastToUser(session.userId, {
      type: 'upload_completed',
      fileId,
      result,
      duration: session.endTime - session.startTime
    });

    // Clean up session after delay
    setTimeout(() => {
      this.uploadSessions.delete(fileId);
    }, 30000); // Keep for 30 seconds for potential retries
  }

  /**
   * Handle upload error
   * @param {string} fileId - File identifier
   * @param {Error} error - Error object
   * @param {boolean} retryable - Whether upload can be retried
   */
  handleUploadError(fileId, error, retryable = true) {
    const session = this.uploadSessions.get(fileId);
    if (!session) return;

    session.status = 'error';
    session.error = error.message;
    session.retryable = retryable;

    this.broadcastToUser(session.userId, {
      type: 'upload_error',
      fileId,
      error: error.message,
      retryable,
      timestamp: Date.now()
    });
  }

  /**
   * Broadcast message to all user's WebSocket connections
   * @param {string} userId - User ID
   * @param {Object} message - Message to broadcast
   */
  broadcastToUser(userId, message) {
    const userClients = this.clients.get(userId);
    if (!userClients) return;

    const messageStr = JSON.stringify(message);
    const deadConnections = [];

    userClients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(messageStr);
        } catch (error) {
          logger.error('Error sending WebSocket message:', error);
          deadConnections.push(ws);
        }
      } else {
        deadConnections.push(ws);
      }
    });

    // Clean up dead connections
    deadConnections.forEach(ws => userClients.delete(ws));
  }

  /**
   * Get upload session status
   * @param {string} fileId - File identifier
   * @returns {Object|null} - Session status or null
   */
  getSessionStatus(fileId) {
    return this.uploadSessions.get(fileId) || null;
  }

  /**
   * Clean up old sessions
   */
  cleanupOldSessions() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const [fileId, session] of this.uploadSessions.entries()) {
      if (now - session.startTime > maxAge) {
        this.uploadSessions.delete(fileId);
      }
    }
  }
}

// Singleton instance
const uploadProgressManager = new UploadProgressManager();

// Cleanup old sessions every hour
setInterval(() => {
  uploadProgressManager.cleanupOldSessions();
}, 60 * 60 * 1000);

module.exports = uploadProgressManager;
