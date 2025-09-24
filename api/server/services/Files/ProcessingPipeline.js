const { logger } = require('@librechat/data-schemas');
const uploadProgressManager = require('../WebSocket/UploadProgress');

class ProcessingPipelineManager {
  constructor() {
    this.pipelines = new Map(); // fileId -> pipeline info
    this.stages = {
      'upload': { weight: 0.1, description: 'File upload' },
      'validation': { weight: 0.05, description: 'File validation' },
      'processing': { weight: 0.3, description: 'File processing' },
      'ocr': { weight: 0.2, description: 'OCR processing' },
      'stt': { weight: 0.15, description: 'Speech-to-text' },
      'embedding': { weight: 0.1, description: 'Vector embedding' },
      'storage': { weight: 0.05, description: 'Storage save' },
      'cleanup': { weight: 0.05, description: 'Cleanup' }
    };
  }

  /**
   * Initialize processing pipeline for file
   * @param {string} fileId - File identifier
   * @param {string} userId - User ID
   * @param {Object} metadata - File metadata
   * @param {Array<string>} requiredStages - Required processing stages
   */
  initializePipeline(fileId, userId, metadata, requiredStages = []) {
    const pipeline = {
      fileId,
      userId,
      metadata,
      stages: this.buildStageList(requiredStages),
      currentStage: 'upload',
      stageProgress: 0,
      overallProgress: 0,
      startTime: Date.now(),
      stageStartTime: Date.now(),
      stageHistory: [],
      errors: [],
      warnings: []
    };

    this.pipelines.set(fileId, pipeline);
    
    // Notify client about pipeline start
    uploadProgressManager.updateProgress(fileId, 0, 'pipeline_started', {
      totalStages: pipeline.stages.length,
      stages: pipeline.stages.map(s => s.name)
    });

    logger.info(`Processing pipeline initialized for file ${fileId}`, {
      stages: pipeline.stages.map(s => s.name),
      fileType: metadata.type
    });
  }

  /**
   * Build stage list based on file type and requirements
   * @param {Array<string>} requiredStages - Required stages
   * @returns {Array<Object>} - Stage list
   */
  buildStageList(requiredStages) {
    const baseStages = ['upload', 'validation', 'processing'];
    const allStages = [...baseStages, ...requiredStages, 'storage', 'cleanup'];
    
    return allStages.map(stageName => ({
      name: stageName,
      weight: this.stages[stageName]?.weight || 0.1,
      description: this.stages[stageName]?.description || stageName,
      status: 'pending',
      startTime: null,
      endTime: null,
      duration: null,
      progress: 0,
      error: null
    }));
  }

  /**
   * Start a processing stage
   * @param {string} fileId - File identifier
   * @param {string} stageName - Stage name
   * @param {Object} context - Stage context
   */
  startStage(fileId, stageName, context = {}) {
    const pipeline = this.pipelines.get(fileId);
    if (!pipeline) return;

    const stage = pipeline.stages.find(s => s.name === stageName);
    if (!stage) return;

    stage.status = 'running';
    stage.startTime = Date.now();
    stage.progress = 0;
    pipeline.currentStage = stageName;
    pipeline.stageStartTime = Date.now();
    pipeline.stageProgress = 0;

    // Update overall progress
    this.updateOverallProgress(pipeline);

    uploadProgressManager.updateProgress(fileId, pipeline.overallProgress, stageName, {
      stage: stageName,
      stageProgress: 0,
      description: stage.description,
      context
    });

    logger.info(`Started stage ${stageName} for file ${fileId}`, context);
  }

  /**
   * Update stage progress
   * @param {string} fileId - File identifier
   * @param {string} stageName - Stage name
   * @param {number} progress - Progress (0-1)
   * @param {Object} details - Progress details
   */
  updateStageProgress(fileId, stageName, progress, details = {}) {
    const pipeline = this.pipelines.get(fileId);
    if (!pipeline) return;

    const stage = pipeline.stages.find(s => s.name === stageName);
    if (!stage || stage.status !== 'running') return;

    stage.progress = Math.min(1, Math.max(0, progress));
    pipeline.stageProgress = stage.progress;

    // Update overall progress
    this.updateOverallProgress(pipeline);

    uploadProgressManager.updateProgress(fileId, pipeline.overallProgress, stageName, {
      stage: stageName,
      stageProgress: stage.progress,
      description: stage.description,
      details
    });
  }

  /**
   * Complete a processing stage
   * @param {string} fileId - File identifier
   * @param {string} stageName - Stage name
   * @param {Object} result - Stage result
   */
  completeStage(fileId, stageName, result = {}) {
    const pipeline = this.pipelines.get(fileId);
    if (!pipeline) return;

    const stage = pipeline.stages.find(s => s.name === stageName);
    if (!stage) return;

    stage.status = 'completed';
    stage.endTime = Date.now();
    stage.duration = stage.endTime - stage.startTime;
    stage.progress = 1;

    // Add to stage history
    pipeline.stageHistory.push({
      stage: stageName,
      startTime: stage.startTime,
      endTime: stage.endTime,
      duration: stage.duration,
      result
    });

    // Update overall progress
    this.updateOverallProgress(pipeline);

    uploadProgressManager.updateProgress(fileId, pipeline.overallProgress, stageName, {
      stage: stageName,
      stageProgress: 1,
      description: stage.description,
      completed: true,
      duration: stage.duration,
      result
    });

    logger.info(`Completed stage ${stageName} for file ${fileId}`, {
      duration: stage.duration,
      result
    });
  }

  /**
   * Handle stage error
   * @param {string} fileId - File identifier
   * @param {string} stageName - Stage name
   * @param {Error} error - Error object
   * @param {boolean} recoverable - Whether error is recoverable
   */
  handleStageError(fileId, stageName, error, recoverable = true) {
    const pipeline = this.pipelines.get(fileId);
    if (!pipeline) return;

    const stage = pipeline.stages.find(s => s.name === stageName);
    if (!stage) return;

    stage.status = 'error';
    stage.error = error.message;
    stage.endTime = Date.now();
    stage.duration = stage.endTime - stage.startTime;

    pipeline.errors.push({
      stage: stageName,
      error: error.message,
      timestamp: Date.now(),
      recoverable
    });

    uploadProgressManager.updateProgress(fileId, pipeline.overallProgress, stageName, {
      stage: stageName,
      error: error.message,
      recoverable,
      duration: stage.duration
    });

    logger.error(`Stage ${stageName} failed for file ${fileId}:`, error);
  }

  /**
   * Add warning to pipeline
   * @param {string} fileId - File identifier
   * @param {string} stageName - Stage name
   * @param {string} warning - Warning message
   */
  addWarning(fileId, stageName, warning) {
    const pipeline = this.pipelines.get(fileId);
    if (!pipeline) return;

    pipeline.warnings.push({
      stage: stageName,
      warning,
      timestamp: Date.now()
    });

    logger.warn(`Pipeline warning for file ${fileId} in stage ${stageName}: ${warning}`);
  }

  /**
   * Complete entire pipeline
   * @param {string} fileId - File identifier
   * @param {Object} finalResult - Final processing result
   */
  completePipeline(fileId, finalResult = {}) {
    const pipeline = this.pipelines.get(fileId);
    if (!pipeline) return;

    pipeline.overallProgress = 1;
    pipeline.endTime = Date.now();
    pipeline.totalDuration = pipeline.endTime - pipeline.startTime;

    uploadProgressManager.completeUpload(fileId, {
      ...finalResult,
      pipeline: {
        totalDuration: pipeline.totalDuration,
        stages: pipeline.stages.map(s => ({
          name: s.name,
          status: s.status,
          duration: s.duration,
          error: s.error
        })),
        errors: pipeline.errors,
        warnings: pipeline.warnings
      }
    });

    logger.info(`Processing pipeline completed for file ${fileId}`, {
      totalDuration: pipeline.totalDuration,
      stages: pipeline.stages.length,
      errors: pipeline.errors.length,
      warnings: pipeline.warnings.length
    });

    // Clean up after delay
    setTimeout(() => {
      this.pipelines.delete(fileId);
    }, 60000); // Keep for 1 minute for potential queries
  }

  /**
   * Update overall progress based on stage weights
   * @param {Object} pipeline - Pipeline object
   */
  updateOverallProgress(pipeline) {
    let totalWeight = 0;
    let completedWeight = 0;

    for (const stage of pipeline.stages) {
      totalWeight += stage.weight;
      
      if (stage.status === 'completed') {
        completedWeight += stage.weight;
      } else if (stage.status === 'running') {
        completedWeight += stage.weight * stage.progress;
      }
    }

    pipeline.overallProgress = totalWeight > 0 ? completedWeight / totalWeight : 0;
  }

  /**
   * Get pipeline status
   * @param {string} fileId - File identifier
   * @returns {Object|null} - Pipeline status
   */
  getPipelineStatus(fileId) {
    return this.pipelines.get(fileId) || null;
  }

  /**
   * Get all active pipelines
   * @returns {Array<Object>} - Active pipelines
   */
  getActivePipelines() {
    return Array.from(this.pipelines.values());
  }

  /**
   * Clean up old pipelines
   */
  cleanupOldPipelines() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const [fileId, pipeline] of this.pipelines.entries()) {
      if (now - pipeline.startTime > maxAge) {
        this.pipelines.delete(fileId);
      }
    }
  }
}

// Singleton instance
const processingPipelineManager = new ProcessingPipelineManager();

// Cleanup old pipelines every hour
setInterval(() => {
  processingPipelineManager.cleanupOldPipelines();
}, 60 * 60 * 1000);

module.exports = processingPipelineManager;
