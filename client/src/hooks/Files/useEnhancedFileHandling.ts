import { useCallback, useRef, useState } from 'react';
import { useToastContext } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { logger } from '~/utils';
import useWebSocketProgress from './useWebSocketProgress';
import useFileHandling from './useFileHandling';

interface ChunkedUploadOptions {
  enabled: boolean;
  chunkSize: number;
  maxRetries: number;
  retryDelay: number;
}

interface EnhancedFileHandlingOptions {
  chunkedUpload?: ChunkedUploadOptions;
  realTimeProgress?: boolean;
  errorRecovery?: boolean;
  pipelineStatus?: boolean;
}

export const useEnhancedFileHandling = (options: EnhancedFileHandlingOptions = {}) => {
  const {
    chunkedUpload = { enabled: true, chunkSize: 1024 * 1024, maxRetries: 3, retryDelay: 1000 },
    realTimeProgress = true,
    errorRecovery = true,
    pipelineStatus = true
  } = options;

  const { showToast } = useToastContext();
  const localize = useLocalize();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<Map<string, any>>(new Map());
  const abortControllerRef = useRef<AbortController | null>(null);

  // WebSocket progress tracking
  const {
    isConnected: isWebSocketConnected,
    sessions: webSocketSessions,
    getSessionStatus,
    clearSession
  } = useWebSocketProgress({
    onProgress: (fileId, progress, stage, details) => {
      logger.debug(`Real-time upload progress for ${fileId}: ${Math.round(progress * 100)}% (${stage})`);
      
      // Update local progress state
      setUploadQueue(prev => {
        const newQueue = new Map(prev);
        const upload = newQueue.get(fileId);
        if (upload) {
          upload.progress = progress;
          upload.stage = stage;
          upload.status = 'uploading';
          newQueue.set(fileId, upload);
        }
        return newQueue;
      });
    },
    onComplete: (fileId, result) => {
      logger.info(`Upload completed for ${fileId}:`, result);
      
      // Update local state
      setUploadQueue(prev => {
        const newQueue = new Map(prev);
        const upload = newQueue.get(fileId);
        if (upload) {
          upload.status = 'completed';
          upload.progress = 1;
          upload.stage = 'completed';
          upload.result = result;
          newQueue.set(fileId, upload);
        }
        return newQueue;
      });
      
      clearSession(fileId);
    },
    onError: (fileId, error, retryable) => {
      logger.error(`Upload error for ${fileId}:`, error, 'retryable:', retryable);
      
      // Update local state
      setUploadQueue(prev => {
        const newQueue = new Map(prev);
        const upload = newQueue.get(fileId);
        if (upload) {
          upload.status = 'error';
          upload.error = error;
          upload.retryable = retryable;
          newQueue.set(fileId, upload);
        }
        return newQueue;
      });
      
      if (retryable) {
        showToast({
          message: localize('com_ui_upload_retrying'),
          status: 'info',
          duration: 3000
        });
      } else {
        showToast({
          message: error,
          status: 'error',
          duration: 5000
        });
      }
    }
  });

  // Regular file handling for fallback
  const regularFileHandling = useFileHandling();

  /**
   * Initialize chunked upload session
   */
  const initializeChunkedUpload = useCallback(async (
    fileId: string,
    fileName: string,
    fileSize: number,
    fileType: string,
    toolResource?: string,
    agentId?: string
  ) => {
    try {
      const response = await fetch('/api/files/chunked/init', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          fileId,
          fileName,
          fileSize,
          fileType,
          toolResource,
          agentId
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to initialize chunked upload: ${response.statusText}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      logger.error('Error initializing chunked upload:', error);
      throw error;
    }
  }, []);

  /**
   * Upload file in chunks
   */
  const uploadFileInChunks = useCallback(async (
    file: File,
    fileId: string,
    onProgress?: (progress: number, stage: string) => void
  ) => {
    const chunkSize = chunkedUpload.chunkSize;
    const totalChunks = Math.ceil(file.size / chunkSize);
    const chunks: Blob[] = [];

    // Split file into chunks
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      chunks.push(file.slice(start, end));
    }

    // Initialize upload session
    await initializeChunkedUpload(
      fileId,
      file.name,
      file.size,
      file.type,
      'file_search', // Default tool resource
      undefined // agentId
    );

    // Upload chunks
    for (let i = 0; i < chunks.length; i++) {
      if (abortControllerRef.current?.signal.aborted) {
        throw new Error('Upload aborted');
      }

      const chunk = chunks[i];
      const chunkHash = await this.calculateChunkHash(chunk);
      
      const formData = new FormData();
      formData.append('chunk', chunk);
      formData.append('chunkHash', chunkHash);

      const response = await fetch(`/api/files/chunked/upload/${fileId}/${i}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData,
        signal: abortControllerRef.current?.signal
      });

      if (!response.ok) {
        throw new Error(`Chunk ${i} upload failed: ${response.statusText}`);
      }

      const progress = (i + 1) / totalChunks;
      onProgress?.(progress, 'uploading');
    }

    // Complete upload
    const finalPath = `/uploads/${fileId}/${file.name}`;
    const response = await fetch(`/api/files/chunked/complete/${fileId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({
        finalPath,
        toolResource: 'file_search',
        agentId: undefined
      })
    });

    if (!response.ok) {
      throw new Error(`Upload completion failed: ${response.statusText}`);
    }

    return await response.json();
  }, [chunkedUpload.chunkSize, initializeChunkedUpload]);

  /**
   * Calculate chunk hash for integrity checking
   */
  const calculateChunkHash = useCallback(async (chunk: Blob): Promise<string> => {
    const buffer = await chunk.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('MD5', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }, []);

  /**
   * Enhanced file handling with chunked upload support
   */
  const handleFiles = useCallback(async (
    files: FileList | File[],
    toolResource?: string,
    agentId?: string
  ) => {
    setIsUploading(true);
    abortControllerRef.current = new AbortController();

    try {
      const fileList = Array.from(files);
      const results = [];

      for (const file of fileList) {
        const fileId = crypto.randomUUID();
        
        // Add to upload queue
        setUploadQueue(prev => {
          const newQueue = new Map(prev);
          newQueue.set(fileId, {
            file,
            status: 'pending',
            progress: 0,
            stage: 'initializing'
          });
          return newQueue;
        });

        try {
          // Determine upload method based on file size and options
          const useChunkedUpload = chunkedUpload.enabled && file.size > chunkedUpload.chunkSize;
          
          if (useChunkedUpload) {
            await uploadFileInChunks(file, fileId, (progress, stage) => {
              setUploadQueue(prev => {
                const newQueue = new Map(prev);
                const upload = newQueue.get(fileId);
                if (upload) {
                  upload.progress = progress;
                  upload.stage = stage;
                  upload.status = 'uploading';
                  newQueue.set(fileId, upload);
                }
                return newQueue;
              });
            });
          } else {
            // Use regular file handling for smaller files
            await regularFileHandling.handleFiles([file], toolResource);
          }

          // Update queue status
          setUploadQueue(prev => {
            const newQueue = new Map(prev);
            const upload = newQueue.get(fileId);
            if (upload) {
              upload.status = 'completed';
              upload.progress = 1;
              upload.stage = 'completed';
              newQueue.set(fileId, upload);
            }
            return newQueue;
          });

          results.push({ fileId, success: true });

        } catch (error) {
          logger.error(`Error uploading file ${file.name}:`, error);
          
          // Update queue with error
          setUploadQueue(prev => {
            const newQueue = new Map(prev);
            const upload = newQueue.get(fileId);
            if (upload) {
              upload.status = 'error';
              upload.error = error.message;
              newQueue.set(fileId, upload);
            }
            return newQueue;
          });

          results.push({ fileId, success: false, error: error.message });
        }
      }

      return results;

    } catch (error) {
      logger.error('Error in enhanced file handling:', error);
      throw error;
    } finally {
      setIsUploading(false);
    }
  }, [chunkedUpload, uploadFileInChunks, regularFileHandling]);

  /**
   * Abort all uploads
   */
  const abortUploads = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Clear upload queue
    setUploadQueue(new Map());

    // Clear WebSocket sessions
    webSocketSessions.forEach(session => {
      clearSession(session.fileId);
    });

    logger.info('All uploads aborted');
  }, [webSocketSessions, clearSession]);

  /**
   * Retry failed upload
   */
  const retryUpload = useCallback(async (fileId: string) => {
    const upload = uploadQueue.get(fileId);
    if (!upload) return;

    try {
      setUploadQueue(prev => {
        const newQueue = new Map(prev);
        const upload = newQueue.get(fileId);
        if (upload) {
          upload.status = 'retrying';
          upload.error = undefined;
          newQueue.set(fileId, upload);
        }
        return newQueue;
      });

      // Retry logic here
      await uploadFileInChunks(upload.file, fileId, (progress, stage) => {
        setUploadQueue(prev => {
          const newQueue = new Map(prev);
          const upload = newQueue.get(fileId);
          if (upload) {
            upload.progress = progress;
            upload.stage = stage;
            upload.status = 'uploading';
            newQueue.set(fileId, upload);
          }
          return newQueue;
        });
      });

    } catch (error) {
      logger.error(`Retry failed for ${fileId}:`, error);
      throw error;
    }
  }, [uploadQueue, uploadFileInChunks]);

  /**
   * Get upload status
   */
  const getUploadStatus = useCallback((fileId: string) => {
    const queueStatus = uploadQueue.get(fileId);
    const webSocketStatus = getSessionStatus(fileId);
    
    return {
      queue: queueStatus,
      webSocket: webSocketStatus,
      isConnected: isWebSocketConnected
    };
  }, [uploadQueue, getSessionStatus, isWebSocketConnected]);

  return {
    // Enhanced functionality
    handleFiles,
    abortUploads,
    retryUpload,
    getUploadStatus,
    isUploading,
    uploadQueue: Array.from(uploadQueue.values()),
    
    // WebSocket status
    isWebSocketConnected,
    webSocketSessions,
    
    // Chunked upload
    initializeChunkedUpload,
    uploadFileInChunks,
    
    // Regular file handling (fallback)
    ...regularFileHandling
  };
};

export default useEnhancedFileHandling;
