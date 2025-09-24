import { useEffect, useRef, useCallback, useState } from 'react';
import { useToastContext } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { logger } from '~/utils';

interface WebSocketProgressMessage {
  type: 'upload_started' | 'upload_progress' | 'upload_completed' | 'upload_error' | 'pong';
  fileId: string;
  progress?: number;
  stage?: string;
  details?: any;
  error?: string;
  retryable?: boolean;
  result?: any;
  timestamp?: number;
}

interface UploadSession {
  fileId: string;
  progress: number;
  stage: string;
  startTime: number;
  lastUpdate: number;
  error?: string;
  retryable?: boolean;
  result?: any;
}

interface UseWebSocketProgressOptions {
  onProgress?: (fileId: string, progress: number, stage: string, details?: any) => void;
  onComplete?: (fileId: string, result: any) => void;
  onError?: (fileId: string, error: string, retryable: boolean) => void;
  onRetry?: (fileId: string, attempt: number, maxAttempts: number) => void;
}

export const useWebSocketProgress = (options: UseWebSocketProgressOptions = {}) => {
  const { onProgress, onComplete, onError, onRetry } = options;
  const { showToast } = useToastContext();
  const localize = useLocalize();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [sessions, setSessions] = useState<Map<string, UploadSession>>(new Map());
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 1000; // 1 second

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        logger.warn('No authentication token found for WebSocket connection');
        return;
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/upload-progress?token=${encodeURIComponent(token)}`;
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        logger.info('WebSocket connected for upload progress');
        setIsConnected(true);
        reconnectAttempts.current = 0;
        
        // Start ping interval
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000); // Ping every 30 seconds
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketProgressMessage = JSON.parse(event.data);
          handleMessage(message);
        } catch (error) {
          logger.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onclose = (event) => {
        logger.warn('WebSocket disconnected:', event.code, event.reason);
        setIsConnected(false);
        
        // Clear ping interval
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }

        // Attempt reconnection if not a clean close
        if (event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          const delay = reconnectDelay * Math.pow(2, reconnectAttempts.current - 1);
          
          logger.info(`Attempting to reconnect in ${delay}ms (attempt ${reconnectAttempts.current})`);
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        }
      };

      ws.onerror = (error) => {
        logger.error('WebSocket error:', error);
        setIsConnected(false);
      };

    } catch (error) {
      logger.error('Error creating WebSocket connection:', error);
      setIsConnected(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000, 'Client disconnect');
      wsRef.current = null;
    }

    setIsConnected(false);
  }, []);

  const handleMessage = useCallback((message: WebSocketProgressMessage) => {
    const { type, fileId, progress, stage, details, error, retryable, result } = message;

    switch (type) {
      case 'upload_started':
        setSessions(prev => {
          const newSessions = new Map(prev);
          newSessions.set(fileId, {
            fileId,
            progress: 0,
            stage: 'uploading',
            startTime: Date.now(),
            lastUpdate: Date.now()
          });
          return newSessions;
        });
        break;

      case 'upload_progress':
        setSessions(prev => {
          const newSessions = new Map(prev);
          const session = newSessions.get(fileId);
          if (session) {
            session.progress = progress || 0;
            session.stage = stage || 'uploading';
            session.lastUpdate = Date.now();
            newSessions.set(fileId, session);
          }
          return newSessions;
        });

        if (onProgress) {
          onProgress(fileId, progress || 0, stage || 'uploading', details);
        }
        break;

      case 'upload_completed':
        setSessions(prev => {
          const newSessions = new Map(prev);
          const session = newSessions.get(fileId);
          if (session) {
            session.progress = 1;
            session.stage = 'completed';
            session.result = result;
            newSessions.set(fileId, session);
          }
          return newSessions;
        });

        if (onComplete) {
          onComplete(fileId, result);
        }

        // Show success toast
        showToast({
          message: localize('com_ui_upload_success'),
          status: 'success',
          duration: 3000
        });
        break;

      case 'upload_error':
        setSessions(prev => {
          const newSessions = new Map(prev);
          const session = newSessions.get(fileId);
          if (session) {
            session.error = error;
            session.retryable = retryable;
            newSessions.set(fileId, session);
          }
          return newSessions;
        });

        if (onError) {
          onError(fileId, error || 'Unknown error', retryable || false);
        }

        // Show error toast
        showToast({
          message: error || localize('com_error_files_upload'),
          status: 'error',
          duration: 5000
        });
        break;

      case 'pong':
        // Handle pong response
        break;
    }
  }, [onProgress, onComplete, onError, showToast, localize]);

  const getSessionStatus = useCallback((fileId: string): UploadSession | undefined => {
    return sessions.get(fileId);
  }, [sessions]);

  const getAllSessions = useCallback((): UploadSession[] => {
    return Array.from(sessions.values());
  }, [sessions]);

  const clearSession = useCallback((fileId: string) => {
    setSessions(prev => {
      const newSessions = new Map(prev);
      newSessions.delete(fileId);
      return newSessions;
    });
  }, []);

  const clearAllSessions = useCallback(() => {
    setSessions(new Map());
  }, []);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
    };
  }, []);

  return {
    isConnected,
    sessions: Array.from(sessions.values()),
    getSessionStatus,
    getAllSessions,
    clearSession,
    clearAllSessions,
    connect,
    disconnect
  };
};

export default useWebSocketProgress;
