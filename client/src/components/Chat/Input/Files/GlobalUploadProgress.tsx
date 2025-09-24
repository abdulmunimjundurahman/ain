import React from 'react';
import { useWebSocketProgress } from '~/hooks/Files/useWebSocketProgress';
import UploadProgressOverlay from './UploadProgressOverlay';

export default function GlobalUploadProgress() {
  const { sessions, isConnected } = useWebSocketProgress();

  // Only show if there are active uploads
  const hasActiveUploads = sessions.some(session => 
    session.stage !== 'completed' || 
    (session.lastUpdate && Date.now() - session.lastUpdate < 30000)
  );

  if (!hasActiveUploads) {
    return null;
  }

  return (
    <UploadProgressOverlay />
  );
}
