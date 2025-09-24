import React, { useState } from 'react';
import { useEnhancedFileHandling } from '~/hooks/Files/useEnhancedFileHandling';
import { useLocalize } from '~/hooks';

export default function ProgressDemo() {
  const localize = useLocalize();
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const { handleFiles, isUploading, uploadQueue, isWebSocketConnected } = useEnhancedFileHandling({
    chunkedUpload: { enabled: true, chunkSize: 1024 * 1024 },
    realTimeProgress: true,
    errorRecovery: true,
    pipelineStatus: true
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setSelectedFiles(event.target.files);
    }
  };

  const handleUpload = async () => {
    if (!selectedFiles) return;
    
    try {
      await handleFiles(selectedFiles, 'file_search');
      setSelectedFiles(null);
    } catch (error) {
      console.error('Upload failed:', error);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">Enhanced File Upload Demo</h2>
      
      {/* Connection Status */}
      <div className="mb-4 p-3 rounded-lg bg-gray-100">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${isWebSocketConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
          <span className="font-medium">
            WebSocket: {isWebSocketConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* File Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select files to upload:
        </label>
        <input
          type="file"
          multiple
          onChange={handleFileSelect}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
      </div>

      {/* Upload Button */}
      <button
        onClick={handleUpload}
        disabled={!selectedFiles || isUploading}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isUploading ? 'Uploading...' : 'Upload Files'}
      </button>

      {/* Upload Queue Status */}
      {uploadQueue.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-3">Upload Queue ({uploadQueue.length})</h3>
          <div className="space-y-3">
            {uploadQueue.map((upload, index) => (
              <div key={index} className="p-3 border rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{upload.file?.name || 'Unknown'}</span>
                  <span className="text-sm text-gray-500">
                    {Math.round((upload.progress || 0) * 100)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(upload.progress || 0) * 100}%` }}
                  ></div>
                </div>
                <div className="mt-1 text-sm text-gray-600">
                  Status: {upload.status} | Stage: {upload.stage}
                </div>
                {upload.error && (
                  <div className="mt-1 text-sm text-red-600">
                    Error: {upload.error}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Features List */}
      <div className="mt-8 p-4 bg-blue-50 rounded-lg">
        <h3 className="font-semibold text-blue-900 mb-2">New Features:</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>✅ Real-time progress via WebSocket</li>
          <li>✅ Chunked upload for large files</li>
          <li>✅ Automatic error recovery with exponential backoff</li>
          <li>✅ File processing pipeline status tracking</li>
          <li>✅ Live connection status indicator</li>
          <li>✅ Enhanced progress visualization</li>
        </ul>
      </div>
    </div>
  );
}
