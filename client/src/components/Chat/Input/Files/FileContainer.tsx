import { Button } from '@librechat/client';
import { useLocalize } from '~/hooks';
import type { TFile } from 'librechat-data-provider';
import type { ExtendedFile } from '~/common';
import { getFileType, cn } from '~/utils';
import FilePreview from './FilePreview';
import RemoveFile from './RemoveFile';
import RealTimeProgressBar from './RealTimeProgressBar';

const FileContainer = ({
  file,
  overrideType,
  buttonClassName,
  containerClassName,
  onDelete,
  onClick,
  onRetry,
}: {
  file: Partial<ExtendedFile | TFile>;
  overrideType?: string;
  buttonClassName?: string;
  containerClassName?: string;
  onDelete?: () => void;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  onRetry?: () => void;
}) => {
  const fileType = getFileType(overrideType ?? file.type);
  const localize = useLocalize();

  return (
    <div
      className={cn('group relative inline-block text-sm text-text-primary', containerClassName)}
    >
      <button
        type="button"
        onClick={onClick}
        aria-label={file.filename}
        className={cn(
          'relative overflow-hidden rounded-2xl border border-border-light bg-surface-hover-alt',
          buttonClassName,
        )}
      >
        <div className="w-56 p-1.5 pb-3">
          <div className="flex flex-row items-center gap-2">
            <FilePreview file={file} fileType={fileType} className="relative" />
            <div className="overflow-hidden">
              <div className="truncate font-medium" title={file.filename}>
                {file.filename}
              </div>
              <div className="truncate text-text-secondary" title={fileType.title}>
                {fileType.title}
              </div>
            </div>
          </div>
        </div>
        {/* Enhanced progress bar with real-time updates */}
        {typeof file.progress === 'number' && file.progress < 1 && (
          <div className="absolute bottom-0 left-0 right-0">
            <div className="h-1 w-full bg-surface-secondary">
              <div
                className="h-1 bg-primary transition-[width] duration-300 ease-out"
                style={{ width: `${Math.round((file.progress ?? 0) * 100)}%` }}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round((file.progress ?? 0) * 100)}
              />
            </div>
            {/* Real-time progress overlay for active uploads */}
            {file.file_id && (
              <div className="absolute -top-16 left-0 right-0 z-10">
                <RealTimeProgressBar
                  fileId={file.file_id}
                  fileName={file.filename || 'Unknown file'}
                  fileSize={file.size || 0}
                  className="text-xs"
                />
              </div>
            )}
          </div>
        )}
      </button>
      {onDelete && <RemoveFile onRemove={onDelete} />}
      {/* Retry button when error */}
      {file?.error && onRetry && (
        <div className="absolute bottom-1 right-2">
          <Button variant="outline" size="sm" onClick={onRetry}>
            {localize('com_agents_error_retry')}
          </Button>
        </div>
      )}
    </div>
  );
};

export default FileContainer;
