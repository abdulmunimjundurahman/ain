const { logger } = require('@librechat/data-schemas');
const uploadProgressManager = require('../WebSocket/UploadProgress');

class ErrorRecoveryManager {
  constructor() {
    this.retryAttempts = new Map(); // fileId -> retry info
    this.maxRetries = 3;
    this.baseDelay = 1000; // 1 second base delay
    this.maxDelay = 30000; // 30 seconds max delay
    this.jitter = 0.1; // 10% jitter
  }

  /**
   * Handle upload error with intelligent retry logic
   * @param {string} fileId - File identifier
   * @param {Error} error - Error object
   * @param {Object} context - Error context
   * @returns {Promise<Object>} - Recovery action
   */
  async handleError(fileId, error, context = {}) {
    const retryInfo = this.getRetryInfo(fileId);
    const errorType = this.categorizeError(error);
    
    logger.error(`Upload error for file ${fileId}:`, {
      error: error.message,
      type: errorType,
      attempt: retryInfo.attempts,
      context
    });

    // Update retry info
    retryInfo.attempts++;
    retryInfo.lastError = error.message;
    retryInfo.lastErrorTime = Date.now();
    retryInfo.errorHistory.push({
      error: error.message,
      type: errorType,
      timestamp: Date.now(),
      context
    });

    // Determine if error is retryable
    const retryable = this.isRetryableError(error, errorType);
    
    if (!retryable || retryInfo.attempts >= this.maxRetries) {
      return this.handleFinalFailure(fileId, error, retryInfo);
    }

    // Calculate exponential backoff delay
    const delay = this.calculateBackoffDelay(retryInfo.attempts);
    
    // Schedule retry
    const retryAction = {
      action: 'retry',
      delay,
      attempt: retryInfo.attempts,
      maxAttempts: this.maxRetries,
      errorType,
      retryable: true
    };

    // Notify client about retry
    uploadProgressManager.handleUploadError(fileId, error, retryable);
    
    // Schedule retry
    setTimeout(() => {
      this.executeRetry(fileId, context);
    }, delay);

    return retryAction;
  }

  /**
   * Execute retry attempt
   * @param {string} fileId - File identifier
   * @param {Object} context - Retry context
   */
  async executeRetry(fileId, context) {
    try {
      const retryInfo = this.getRetryInfo(fileId);
      
      logger.info(`Retrying upload for file ${fileId} (attempt ${retryInfo.attempts})`);
      
      // Update progress to show retry
      uploadProgressManager.updateProgress(fileId, 0, 'retrying', {
        attempt: retryInfo.attempts,
        maxAttempts: this.maxRetries
      });

      // Execute retry logic based on context
      if (context.chunkedUpload) {
        await this.retryChunkedUpload(fileId, context);
      } else {
        await this.retryRegularUpload(fileId, context);
      }

    } catch (error) {
      // If retry fails, handle as new error
      await this.handleError(fileId, error, context);
    }
  }

  /**
   * Retry chunked upload
   * @param {string} fileId - File identifier
   * @param {Object} context - Retry context
   */
  async retryChunkedUpload(fileId, context) {
    const ChunkedUploadManager = require('./ChunkedUpload');
    
    // Resume upload from where it left off
    const resumeInfo = await ChunkedUploadManager.resumeUpload(fileId);
    
    if (resumeInfo.missingChunks.length > 0) {
      // Notify client about missing chunks
      uploadProgressManager.updateProgress(fileId, resumeInfo.progress, 'resuming', {
        missingChunks: resumeInfo.missingChunks,
        totalChunks: resumeInfo.totalChunks
      });
    }
  }

  /**
   * Retry regular upload
   * @param {string} fileId - File identifier
   * @param {Object} context - Retry context
   */
  async retryRegularUpload(fileId, context) {
    // For regular uploads, we need to restart the entire process
    // This would typically involve re-uploading the file
    uploadProgressManager.updateProgress(fileId, 0, 'retrying', {
      message: 'Restarting upload...'
    });
  }

  /**
   * Handle final failure after all retries exhausted
   * @param {string} fileId - File identifier
   * @param {Error} error - Final error
   * @param {Object} retryInfo - Retry information
   * @returns {Object} - Failure action
   */
  handleFinalFailure(fileId, error, retryInfo) {
    logger.error(`Upload failed permanently for file ${fileId} after ${retryInfo.attempts} attempts`);
    
    // Clean up resources
    this.cleanup(fileId);
    
    // Notify client of final failure
    uploadProgressManager.handleUploadError(fileId, error, false);
    
    return {
      action: 'failure',
      final: true,
      attempts: retryInfo.attempts,
      error: error.message,
      errorHistory: retryInfo.errorHistory
    };
  }

  /**
   * Categorize error type
   * @param {Error} error - Error object
   * @returns {string} - Error category
   */
  categorizeError(error) {
    const message = error.message.toLowerCase();
    
    if (message.includes('network') || message.includes('timeout')) {
      return 'network';
    }
    if (message.includes('size') || message.includes('limit')) {
      return 'size';
    }
    if (message.includes('format') || message.includes('type')) {
      return 'format';
    }
    if (message.includes('permission') || message.includes('access')) {
      return 'permission';
    }
    if (message.includes('storage') || message.includes('disk')) {
      return 'storage';
    }
    if (message.includes('authentication') || message.includes('auth')) {
      return 'auth';
    }
    
    return 'unknown';
  }

  /**
   * Check if error is retryable
   * @param {Error} error - Error object
   * @param {string} errorType - Error category
   * @returns {boolean} - Whether error is retryable
   */
  isRetryableError(error, errorType) {
    const nonRetryableTypes = ['format', 'permission', 'auth'];
    const nonRetryableMessages = [
      'unsupported file type',
      'file too large',
      'invalid file format',
      'permission denied',
      'authentication failed'
    ];

    if (nonRetryableTypes.includes(errorType)) {
      return false;
    }

    const message = error.message.toLowerCase();
    return !nonRetryableMessages.some(nonRetryable => 
      message.includes(nonRetryable)
    );
  }

  /**
   * Calculate exponential backoff delay with jitter
   * @param {number} attempt - Current attempt number
   * @returns {number} - Delay in milliseconds
   */
  calculateBackoffDelay(attempt) {
    const exponentialDelay = this.baseDelay * Math.pow(2, attempt - 1);
    const delay = Math.min(exponentialDelay, this.maxDelay);
    
    // Add jitter to prevent thundering herd
    const jitterAmount = delay * this.jitter * Math.random();
    return Math.floor(delay + jitterAmount);
  }

  /**
   * Get retry information for file
   * @param {string} fileId - File identifier
   * @returns {Object} - Retry information
   */
  getRetryInfo(fileId) {
    if (!this.retryAttempts.has(fileId)) {
      this.retryAttempts.set(fileId, {
        attempts: 0,
        startTime: Date.now(),
        errorHistory: [],
        lastError: null,
        lastErrorTime: null
      });
    }
    return this.retryAttempts.get(fileId);
  }

  /**
   * Clean up retry information
   * @param {string} fileId - File identifier
   */
  cleanup(fileId) {
    this.retryAttempts.delete(fileId);
  }

  /**
   * Get retry statistics
   * @returns {Object} - Retry statistics
   */
  getStats() {
    const stats = {
      activeRetries: this.retryAttempts.size,
      totalAttempts: 0,
      successfulRetries: 0,
      failedRetries: 0
    };

    for (const [fileId, retryInfo] of this.retryAttempts.entries()) {
      stats.totalAttempts += retryInfo.attempts;
      if (retryInfo.attempts > 0) {
        // Check if retry was successful (no recent errors)
        const timeSinceLastError = Date.now() - (retryInfo.lastErrorTime || 0);
        if (timeSinceLastError > 60000) { // 1 minute
          stats.successfulRetries++;
        } else {
          stats.failedRetries++;
        }
      }
    }

    return stats;
  }
}

module.exports = new ErrorRecoveryManager();
