const express = require('express');
const multer = require('multer');
const { requireJwtAuth, configMiddleware } = require('~/server/middleware');
const { logger } = require('@librechat/data-schemas');
const ChunkedUploadManager = require('~/server/services/Files/ChunkedUpload');
const ErrorRecoveryManager = require('~/server/services/Files/ErrorRecovery');
const ProcessingPipelineManager = require('~/server/services/Files/ProcessingPipeline');
const uploadProgressManager = require('~/server/services/WebSocket/UploadProgress');

const router = express.Router();

// Configure multer for chunk uploads
const chunkStorage = multer.memoryStorage();
const chunkUpload = multer({ 
  storage: chunkStorage,
  limits: { 
    fileSize: 10 * 1024 * 1024, // 10MB max per chunk
    fieldSize: 1024 * 1024 // 1MB max field size
  }
});

/**
 * Initialize chunked upload session
 * @route POST /chunked/init
 */
router.post('/init', requireJwtAuth, configMiddleware, async (req, res) => {
  try {
    const { fileId, fileName, fileSize, fileType, toolResource, agentId } = req.body;

    if (!fileId || !fileName || !fileSize) {
      return res.status(400).json({ 
        error: 'Missing required fields: fileId, fileName, fileSize' 
      });
    }

    const metadata = {
      fileName,
      size: parseInt(fileSize),
      type: fileType,
      toolResource,
      agentId,
      userId: req.user.id
    };

    const session = await ChunkedUploadManager.initializeChunkedUpload(
      fileId, 
      req.user.id, 
      metadata
    );

    // Initialize processing pipeline
    const requiredStages = [];
    if (toolResource === 'ocr') requiredStages.push('ocr');
    if (toolResource === 'file_search') requiredStages.push('embedding');
    if (fileType?.startsWith('audio/')) requiredStages.push('stt');

    ProcessingPipelineManager.initializePipeline(
      fileId, 
      req.user.id, 
      metadata, 
      requiredStages
    );

    res.json({
      success: true,
      fileId,
      totalChunks: session.totalChunks,
      chunkSize: ChunkedUploadManager.chunkSize,
      session: {
        startTime: session.startTime,
        tempDir: session.tempDir
      }
    });

  } catch (error) {
    logger.error('Error initializing chunked upload:', error);
    res.status(500).json({ 
      error: 'Failed to initialize chunked upload',
      message: error.message 
    });
  }
});

/**
 * Upload a single chunk
 * @route POST /chunked/upload/:fileId/:chunkIndex
 */
router.post('/upload/:fileId/:chunkIndex', 
  requireJwtAuth, 
  configMiddleware,
  chunkUpload.single('chunk'),
  async (req, res) => {
    try {
      const { fileId, chunkIndex } = req.params;
      const { chunkHash } = req.body;
      const chunkData = req.file?.buffer;

      if (!chunkData) {
        return res.status(400).json({ error: 'No chunk data provided' });
      }

      const chunkIndexNum = parseInt(chunkIndex);
      if (isNaN(chunkIndexNum) || chunkIndexNum < 0) {
        return res.status(400).json({ error: 'Invalid chunk index' });
      }

      const result = await ChunkedUploadManager.uploadChunk(
        fileId,
        chunkIndexNum,
        chunkData,
        chunkHash
      );

      res.json({
        success: true,
        ...result
      });

    } catch (error) {
      logger.error('Error uploading chunk:', error);
      
      // Handle error with recovery manager
      const recoveryAction = await ErrorRecoveryManager.handleError(
        req.params.fileId,
        error,
        { chunkedUpload: true, chunkIndex: req.params.chunkIndex }
      );

      res.status(500).json({
        error: 'Chunk upload failed',
        message: error.message,
        recovery: recoveryAction
      });
    }
  }
);

/**
 * Resume chunked upload
 * @route GET /chunked/resume/:fileId
 */
router.get('/resume/:fileId', requireJwtAuth, configMiddleware, async (req, res) => {
  try {
    const { fileId } = req.params;
    
    const resumeInfo = await ChunkedUploadManager.resumeUpload(fileId);
    
    res.json({
      success: true,
      ...resumeInfo
    });

  } catch (error) {
    logger.error('Error resuming upload:', error);
    res.status(500).json({
      error: 'Failed to resume upload',
      message: error.message
    });
  }
});

/**
 * Complete chunked upload
 * @route POST /chunked/complete/:fileId
 */
router.post('/complete/:fileId', requireJwtAuth, configMiddleware, async (req, res) => {
  try {
    const { fileId } = req.params;
    const { finalPath, toolResource, agentId } = req.body;

    if (!finalPath) {
      return res.status(400).json({ error: 'Final path required' });
    }

    // Start assembly stage
    ProcessingPipelineManager.startStage(fileId, 'processing', {
      stage: 'assembly',
      description: 'Assembling file chunks'
    });

    const result = await ChunkedUploadManager.assembleFile(fileId, finalPath);
    
    // Complete processing stage
    ProcessingPipelineManager.completeStage(fileId, 'processing', result);

    // Start next stage based on tool resource
    if (toolResource === 'ocr') {
      ProcessingPipelineManager.startStage(fileId, 'ocr', {
        description: 'Performing OCR on uploaded file'
      });
    } else if (toolResource === 'file_search') {
      ProcessingPipelineManager.startStage(fileId, 'embedding', {
        description: 'Generating embeddings for file search'
      });
    }

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    logger.error('Error completing upload:', error);
    
    // Handle error with recovery manager
    const recoveryAction = await ErrorRecoveryManager.handleError(
      fileId,
      error,
      { chunkedUpload: true, stage: 'assembly' }
    );

    res.status(500).json({
      error: 'Upload completion failed',
      message: error.message,
      recovery: recoveryAction
    });
  }
});

/**
 * Cancel chunked upload
 * @route DELETE /chunked/:fileId
 */
router.delete('/:fileId', requireJwtAuth, configMiddleware, async (req, res) => {
  try {
    const { fileId } = req.params;
    
    await ChunkedUploadManager.cancelUpload(fileId);
    
    res.json({
      success: true,
      message: 'Upload cancelled'
    });

  } catch (error) {
    logger.error('Error cancelling upload:', error);
    res.status(500).json({
      error: 'Failed to cancel upload',
      message: error.message
    });
  }
});

/**
 * Get upload status
 * @route GET /chunked/status/:fileId
 */
router.get('/status/:fileId', requireJwtAuth, configMiddleware, async (req, res) => {
  try {
    const { fileId } = req.params;
    
    const session = await ChunkedUploadManager.getSession(fileId);
    const pipelineStatus = ProcessingPipelineManager.getPipelineStatus(fileId);
    
    if (!session && !pipelineStatus) {
      return res.status(404).json({ error: 'Upload session not found' });
    }

    res.json({
      success: true,
      session,
      pipeline: pipelineStatus
    });

  } catch (error) {
    logger.error('Error getting upload status:', error);
    res.status(500).json({
      error: 'Failed to get upload status',
      message: error.message
    });
  }
});

/**
 * Validate chunk integrity
 * @route POST /chunked/validate/:fileId
 */
router.post('/validate/:fileId', requireJwtAuth, configMiddleware, async (req, res) => {
  try {
    const { fileId } = req.params;
    
    const isValid = await ChunkedUploadManager.validateChunks(fileId);
    
    res.json({
      success: true,
      valid: isValid
    });

  } catch (error) {
    logger.error('Error validating chunks:', error);
    res.status(500).json({
      error: 'Failed to validate chunks',
      message: error.message
    });
  }
});

module.exports = router;
