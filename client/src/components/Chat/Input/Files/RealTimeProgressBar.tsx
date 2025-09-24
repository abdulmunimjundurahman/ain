import React, { useState, useEffect } from 'react';
import { useWebSocketProgress } from '~/hooks/Files/useWebSocketProgress';
import { useLocalize } from '~/hooks';
import { logger } from '~/utils';

interface RealTimeProgressBarProps {
  fileId: string;
  fileName: string;
  fileSize: number;
  onComplete?: (result: any) => void;
  onError?: (error: string) => void;
  className?: string;
}

export default function RealTimeProgressBar({
  fileId,
  fileName,
  fileSize,
  onComplete,
  onError,
  className = ''
}: RealTimeProgressBarProps) {
  const localize = useLocalize();
  const { getSessionStatus, isConnected } = useWebSocketProgress();
  const [session, setSession] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(true);
  const [stageDetails, setStageDetails] = useState<any>({});

  useEffect(() => {
    const updateSession = () => {
      const currentSession = getSessionStatus(fileId);
      setSession(currentSession);
      
      if (currentSession) {
        setStageDetails(currentSession.details || {});
        
        // Handle completion
        if (currentSession.stage === 'completed' && currentSession.result) {
          onComplete?.(currentSession.result);
          setIsVisible(false);
        }
        
        // Handle errors
        if (currentSession.error) {
          onError?.(currentSession.error);
        }
      }
    };

    // Initial update
    updateSession();

    // Set up interval to check for updates
    const interval = setInterval(updateSession, 100); // Check every 100ms for smooth updates

    return () => clearInterval(interval);
  }, [fileId, getSessionStatus, onComplete, onError]);

  if (!isVisible || !session) {
    return null;
  }

  const progress = Math.round((session.progress || 0) * 100);
  const stage = session.stage || 'uploading';
  const isError = !!session.error;
  const isCompleted = session.stage === 'completed';

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Get stage description
  const getStageDescription = (stage: string, details: any) => {
    switch (stage) {
      case 'uploading':
        return details.completedChunks && details.totalChunks 
          ? `Uploading chunk ${details.completedChunks} of ${details.totalChunks}`
          : 'Uploading file...';
      case 'validating':
        return 'Validating file format...';
      case 'processing':
        return details.stage === 'assembly' ? 'Assembling file chunks...' : 'Processing file...';
      case 'ocr':
        return 'Extracting text from image...';
      case 'stt':
        return 'Converting speech to text...';
      case 'embedding':
        return 'Generating embeddings...';
      case 'storage':
        return 'Saving to storage...';
      case 'cleanup':
        return 'Finalizing...';
      case 'completed':
        return 'Upload completed!';
      case 'error':
        return 'Upload failed';
      default:
        return 'Processing...';
    }
  };

  // Get progress color based on status
  const getProgressColor = () => {
    if (isError) return 'bg-red-500';
    if (isCompleted) return 'bg-green-500';
    if (stage === 'uploading') return 'bg-blue-500';
    if (stage === 'processing' || stage === 'ocr' || stage === 'stt' || stage === 'embedding') return 'bg-purple-500';
    return 'bg-blue-500';
  };

  // Get connection status indicator
  const getConnectionStatus = () => {
    if (!isConnected) {
      return (
        <div className="flex items-center gap-1 text-yellow-600 text-xs">
          <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
          Offline
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1 text-green-600 text-xs">
        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
        Live
      </div>
    );
  };

  return (
    <div className={`bg-white border border-gray-200 rounded-lg p-4 shadow-lg ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <div>
            <div className="font-medium text-gray-900 truncate max-w-xs" title={fileName}>
              {fileName}
            </div>
            <div className="text-sm text-gray-500">
              {formatFileSize(fileSize)}
            </div>
          </div>
        </div>
        {getConnectionStatus()}
      </div>

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-gray-700">
            {getStageDescription(stage, stageDetails)}
          </span>
          <span className="text-sm font-medium text-gray-700">
            {progress}%
          </span>
        </div>
        
        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ease-out ${getProgressColor()}`}
            style={{ width: `${progress}%` }}
          >
            {/* Animated shimmer effect for active uploads */}
            {!isCompleted && !isError && (
              <div className="h-full bg-gradient-to-r from-transparent via-white to-transparent opacity-30 animate-pulse"></div>
            )}
          </div>
        </div>

        {/* Stage-specific details */}
        {stageDetails && (
          <div className="mt-2 text-xs text-gray-600">
            {stageDetails.completedChunks && stageDetails.totalChunks && (
              <div>Chunks: {stageDetails.completedChunks}/{stageDetails.totalChunks}</div>
            )}
            {stageDetails.assembledChunks && stageDetails.totalChunks && (
              <div>Assembling: {stageDetails.assembledChunks}/{stageDetails.totalChunks}</div>
            )}
            {stageDetails.duration && (
              <div>Duration: {Math.round(stageDetails.duration / 1000)}s</div>
            )}
          </div>
        )}
      </div>

      {/* Status indicators */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-gray-500">
          {isError && (
            <div className="flex items-center gap-1 text-red-600">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              Failed
            </div>
          )}
          
          {isCompleted && (
            <div className="flex items-center gap-1 text-green-600">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Complete
            </div>
          )}

          {!isError && !isCompleted && (
            <div className="flex items-center gap-1 text-blue-600">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              {stage === 'uploading' ? 'Uploading' : 'Processing'}
            </div>
          )}
        </div>

        {/* Time elapsed */}
        {session.startTime && (
          <div className="text-xs text-gray-500">
            {Math.round((Date.now() - session.startTime) / 1000)}s
          </div>
        )}
      </div>

      {/* Error details */}
      {isError && session.error && (
        <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {session.error}
        </div>
      )}
    </div>
  );
}
