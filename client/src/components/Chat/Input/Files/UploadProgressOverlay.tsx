import React, { useState, useEffect } from 'react';
import { useWebSocketProgress } from '~/hooks/Files/useWebSocketProgress';
import { useLocalize } from '~/hooks';
import RealTimeProgressBar from './RealTimeProgressBar';

interface UploadProgressOverlayProps {
  className?: string;
}

export default function UploadProgressOverlay({ className = '' }: UploadProgressOverlayProps) {
  const localize = useLocalize();
  const { sessions, isConnected } = useWebSocketProgress();
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeSessions, setActiveSessions] = useState<any[]>([]);

  useEffect(() => {
    // Filter active sessions (not completed, not error, or recent)
    const now = Date.now();
    const active = sessions.filter(session => {
      const isRecent = session.lastUpdate && (now - session.lastUpdate) < 30000; // 30 seconds
      const isActive = session.stage !== 'completed' || isRecent;
      return isActive;
    });

    setActiveSessions(active);
  }, [sessions]);

  if (activeSessions.length === 0) {
    return null;
  }

  const totalProgress = activeSessions.reduce((sum, session) => sum + (session.progress || 0), 0) / activeSessions.length;
  const overallProgress = Math.round(totalProgress * 100);
  const hasErrors = activeSessions.some(session => session.error);
  const hasCompleted = activeSessions.some(session => session.stage === 'completed');

  return (
    <div className={`fixed bottom-4 right-4 z-50 ${className}`}>
      {/* Compact view */}
      {!isExpanded && (
        <div 
          className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 cursor-pointer hover:shadow-xl transition-shadow"
          onClick={() => setIsExpanded(true)}
        >
          <div className="flex items-center gap-3">
            {/* Progress indicator */}
            <div className="relative w-12 h-12">
              <svg className="w-12 h-12 transform -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-gray-200"
                  stroke="currentColor"
                  strokeWidth="3"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className={`${hasErrors ? 'text-red-500' : hasCompleted ? 'text-green-500' : 'text-blue-500'}`}
                  stroke="currentColor"
                  strokeWidth="3"
                  fill="none"
                  strokeDasharray={`${overallProgress}, 100`}
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs font-bold text-gray-700">{overallProgress}%</span>
              </div>
            </div>

            {/* Status text */}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-900">
                {activeSessions.length === 1 
                  ? activeSessions[0].fileName || 'Uploading...'
                  : `${activeSessions.length} files uploading`
                }
              </div>
              <div className="text-sm text-gray-500 flex items-center gap-2">
                {!isConnected && (
                  <span className="text-yellow-600">● Offline</span>
                )}
                {isConnected && (
                  <span className="text-green-600">● Live</span>
                )}
                {hasErrors && (
                  <span className="text-red-600">● Error</span>
                )}
                {hasCompleted && !hasErrors && (
                  <span className="text-green-600">● Complete</span>
                )}
              </div>
            </div>

            {/* Expand button */}
            <div className="text-gray-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* Expanded view */}
      {isExpanded && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-xl max-w-md">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div>
                <div className="font-medium text-gray-900">Upload Progress</div>
                <div className="text-sm text-gray-500">
                  {activeSessions.length} file{activeSessions.length !== 1 ? 's' : ''} • {overallProgress}% complete
                </div>
              </div>
            </div>
            <button
              onClick={() => setIsExpanded(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Progress bars */}
          <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
            {activeSessions.map((session) => (
              <RealTimeProgressBar
                key={session.fileId}
                fileId={session.fileId}
                fileName={session.fileName || 'Unknown file'}
                fileSize={session.fileSize || 0}
                className="border-0 shadow-none p-0"
              />
            ))}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 rounded-b-lg">
            <div className="flex items-center justify-between text-sm text-gray-500">
              <div className="flex items-center gap-4">
                {!isConnected && (
                  <span className="flex items-center gap-1 text-yellow-600">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                    Offline
                  </span>
                )}
                {isConnected && (
                  <span className="flex items-center gap-1 text-green-600">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    Live
                  </span>
                )}
              </div>
              <div>
                {activeSessions.filter(s => s.stage === 'completed').length} of {activeSessions.length} complete
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
