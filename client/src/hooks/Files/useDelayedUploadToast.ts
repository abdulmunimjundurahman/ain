import { useRef, useState } from 'react';
import { useToastContext } from '@librechat/client';
import { useLocalize } from '~/hooks';

type UploadState = {
  fileName: string;
  fileSize: number;
  lastProgress: number;
  stallTimer?: NodeJS.Timeout;
  initialDelayMs: number;
};

export const useDelayedUploadToast = () => {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [uploadTimers, setUploadTimers] = useState<Record<string, NodeJS.Timeout>>({});
  const uploadStatesRef = useRef<Record<string, UploadState>>({});

  const determineDelay = (fileSize: number): number => {
    const baseDelay = 5000; // 5s
    const perMB = 2000; // +2s/MB
    const sizeMB = Math.max(0, Math.floor(fileSize / 1_000_000));
    const initial = baseDelay + sizeMB * perMB;
    return Math.max(initial, 10000); // At least 10s
  };

  const scheduleToast = (fileId: string) => {
    const state = uploadStatesRef.current[fileId];
    if (!state) return;
    // Clear any existing timer first
    if (state.stallTimer) {
      clearTimeout(state.stallTimer);
    }
    const stallTimer = setTimeout(() => {
      const message = localize('com_ui_upload_delay', { 0: state.fileName });
      showToast({ message, status: 'warning', duration: 10000 });
    }, state.initialDelayMs);
    state.stallTimer = stallTimer;
  };

  const startUploadTimer = (fileId: string, fileName: string, fileSize: number) => {
    const delay = determineDelay(fileSize);
    // Maintain compatibility with previous API (kept for potential consumers)
    if (uploadTimers[fileId]) {
      clearTimeout(uploadTimers[fileId]);
    }
    setUploadTimers((prev) => ({ ...prev, [fileId]: setTimeout(() => {}, delay) }));

    uploadStatesRef.current[fileId] = {
      fileName,
      fileSize,
      lastProgress: 0,
      initialDelayMs: delay,
    };
    scheduleToast(fileId);
  };

  const noteProgress = (
    fileId: string,
    fileName: string,
    fileSize: number,
    progress: number,
  ) => {
    const prev = uploadStatesRef.current[fileId] ?? {
      fileName,
      fileSize,
      lastProgress: 0,
      initialDelayMs: determineDelay(fileSize),
    };
    // If progress advanced by >= 2%, reset the stall timer window
    const advanced = progress - prev.lastProgress >= 0.02;
    uploadStatesRef.current[fileId] = {
      ...prev,
      fileName,
      fileSize,
      lastProgress: Math.max(prev.lastProgress, progress),
    };
    if (advanced) {
      scheduleToast(fileId);
    }
  };

  const clearUploadTimer = (fileId: string) => {
    if (uploadTimers[fileId]) {
      clearTimeout(uploadTimers[fileId]);
      setUploadTimers((prev) => {
        const { [fileId]: _, ...rest } = prev;
        return rest;
      });
    }
    const state = uploadStatesRef.current[fileId];
    if (state?.stallTimer) {
      clearTimeout(state.stallTimer);
    }
    delete uploadStatesRef.current[fileId];
  };

  return { startUploadTimer, noteProgress, clearUploadTimer };
};
