const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { logger } = require('@librechat/data-schemas');
const uploadProgressManager = require('../WebSocket/UploadProgress');

class ChunkedUploadManager {
  constructor() {
    this.chunkSize = 1024 * 1024; // 1MB chunks
    this.maxChunks = 1000; // Maximum 1000 chunks (1GB max)
    this.chunkTimeout = 30 * 60 * 1000; // 30 minutes timeout per chunk
  }

  /**
   * Initialize chunked upload session
   * @param {string} fileId - Unique file identifier
   * @param {string} userId - User ID
   * @param {Object} metadata - File metadata
   * @returns {Object} - Upload session info
   */
  async initializeChunkedUpload(fileId, userId, metadata) {
    const tempDir = path.join(process.env.UPLOADS_PATH || 'uploads', 'temp', 'chunks', userId);
    await fs.mkdir(tempDir, { recursive: true });

    const session = {
      fileId,
      userId,
      tempDir,
      metadata,
      totalChunks: Math.ceil(metadata.size / this.chunkSize),
      receivedChunks: new Set(),
      chunkHashes: new Map(),
      startTime: Date.now(),
      lastActivity: Date.now()
    };

    // Validate file size
    if (metadata.size > this.chunkSize * this.maxChunks) {
      throw new Error(`File too large. Maximum size: ${this.maxChunks}MB`);
    }

    uploadProgressManager.startUploadSession(fileId, userId, {
      ...metadata,
      totalChunks: session.totalChunks,
      chunkSize: this.chunkSize
    });

    return session;
  }

  /**
   * Upload a single chunk
   * @param {string} fileId - File identifier
   * @param {number} chunkIndex - Chunk index (0-based)
   * @param {Buffer} chunkData - Chunk data
   * @param {string} chunkHash - Expected chunk hash for integrity
   * @returns {Promise<Object>} - Upload result
   */
  async uploadChunk(fileId, chunkIndex, chunkData, chunkHash) {
    const session = await this.getSession(fileId);
    if (!session) {
      throw new Error('Upload session not found');
    }

    // Validate chunk index
    if (chunkIndex >= session.totalChunks || chunkIndex < 0) {
      throw new Error('Invalid chunk index');
    }

    // Check if chunk already received
    if (session.receivedChunks.has(chunkIndex)) {
      logger.warn(`Chunk ${chunkIndex} already received for file ${fileId}`);
      return { success: true, alreadyReceived: true };
    }

    // Validate chunk hash
    const actualHash = crypto.createHash('md5').update(chunkData).digest('hex');
    if (chunkHash && actualHash !== chunkHash) {
      throw new Error(`Chunk ${chunkIndex} hash mismatch`);
    }

    // Save chunk to temporary file
    const chunkPath = path.join(session.tempDir, `chunk_${chunkIndex}`);
    await fs.writeFile(chunkPath, chunkData);

    // Update session
    session.receivedChunks.add(chunkIndex);
    session.chunkHashes.set(chunkIndex, actualHash);
    session.lastActivity = Date.now();

    // Update progress
    const progress = session.receivedChunks.size / session.totalChunks;
    uploadProgressManager.updateChunkProgress(fileId, chunkIndex, session.totalChunks, true);

    logger.debug(`Chunk ${chunkIndex} uploaded for file ${fileId} (${progress * 100}% complete)`);

    return {
      success: true,
      progress,
      receivedChunks: session.receivedChunks.size,
      totalChunks: session.totalChunks
    };
  }

  /**
   * Assemble chunks into final file
   * @param {string} fileId - File identifier
   * @param {string} finalPath - Final file path
   * @returns {Promise<Object>} - Assembly result
   */
  async assembleFile(fileId, finalPath) {
    const session = await this.getSession(fileId);
    if (!session) {
      throw new Error('Upload session not found');
    }

    // Check if all chunks received
    if (session.receivedChunks.size !== session.totalChunks) {
      const missingChunks = [];
      for (let i = 0; i < session.totalChunks; i++) {
        if (!session.receivedChunks.has(i)) {
          missingChunks.push(i);
        }
      }
      throw new Error(`Missing chunks: ${missingChunks.join(', ')}`);
    }

    // Create final file directory
    await fs.mkdir(path.dirname(finalPath), { recursive: true });

    // Assemble chunks in order
    const writeStream = require('fs').createWriteStream(finalPath);
    
    try {
      for (let i = 0; i < session.totalChunks; i++) {
        const chunkPath = path.join(session.tempDir, `chunk_${i}`);
        const chunkData = await fs.readFile(chunkPath);
        writeStream.write(chunkData);
        
        // Update progress during assembly
        const assemblyProgress = (i + 1) / session.totalChunks;
        uploadProgressManager.updateProgress(fileId, assemblyProgress, 'assembling', {
          assembledChunks: i + 1,
          totalChunks: session.totalChunks
        });
      }
      
      writeStream.end();
      
      // Wait for write stream to finish
      await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      // Verify final file
      const stats = await fs.stat(finalPath);
      if (stats.size !== session.metadata.size) {
        throw new Error('Assembled file size mismatch');
      }

      // Clean up chunks
      await this.cleanupChunks(session);

      uploadProgressManager.completeUpload(fileId, {
        filePath: finalPath,
        size: stats.size,
        assembledAt: new Date().toISOString()
      });

      return {
        success: true,
        filePath: finalPath,
        size: stats.size
      };

    } catch (error) {
      writeStream.destroy();
      throw error;
    }
  }

  /**
   * Resume chunked upload
   * @param {string} fileId - File identifier
   * @returns {Promise<Object>} - Resume info
   */
  async resumeUpload(fileId) {
    const session = await this.getSession(fileId);
    if (!session) {
      throw new Error('Upload session not found');
    }

    // Check for existing chunks
    const existingChunks = [];
    for (let i = 0; i < session.totalChunks; i++) {
      const chunkPath = path.join(session.tempDir, `chunk_${i}`);
      try {
        await fs.access(chunkPath);
        existingChunks.push(i);
        session.receivedChunks.add(i);
      } catch {
        // Chunk doesn't exist
      }
    }

    return {
      fileId,
      totalChunks: session.totalChunks,
      receivedChunks: existingChunks,
      missingChunks: Array.from({ length: session.totalChunks }, (_, i) => i)
        .filter(i => !existingChunks.includes(i)),
      progress: existingChunks.length / session.totalChunks
    };
  }

  /**
   * Cancel chunked upload
   * @param {string} fileId - File identifier
   */
  async cancelUpload(fileId) {
    const session = await this.getSession(fileId);
    if (session) {
      await this.cleanupChunks(session);
      uploadProgressManager.handleUploadError(fileId, new Error('Upload cancelled'), false);
    }
  }

  /**
   * Get upload session
   * @param {string} fileId - File identifier
   * @returns {Promise<Object|null>} - Session or null
   */
  async getSession(fileId) {
    return uploadProgressManager.getSessionStatus(fileId);
  }

  /**
   * Clean up chunk files
   * @param {Object} session - Upload session
   */
  async cleanupChunks(session) {
    try {
      const files = await fs.readdir(session.tempDir);
      for (const file of files) {
        if (file.startsWith('chunk_')) {
          await fs.unlink(path.join(session.tempDir, file));
        }
      }
      await fs.rmdir(session.tempDir);
    } catch (error) {
      logger.error('Error cleaning up chunks:', error);
    }
  }

  /**
   * Validate chunk integrity
   * @param {string} fileId - File identifier
   * @returns {Promise<boolean>} - Whether all chunks are valid
   */
  async validateChunks(fileId) {
    const session = await this.getSession(fileId);
    if (!session) return false;

    try {
      for (let i = 0; i < session.totalChunks; i++) {
        if (!session.receivedChunks.has(i)) continue;
        
        const chunkPath = path.join(session.tempDir, `chunk_${i}`);
        const chunkData = await fs.readFile(chunkPath);
        const actualHash = crypto.createHash('md5').update(chunkData).digest('hex');
        const expectedHash = session.chunkHashes.get(i);
        
        if (expectedHash && actualHash !== expectedHash) {
          logger.error(`Chunk ${i} integrity check failed for file ${fileId}`);
          return false;
        }
      }
      return true;
    } catch (error) {
      logger.error('Error validating chunks:', error);
      return false;
    }
  }
}

module.exports = new ChunkedUploadManager();
