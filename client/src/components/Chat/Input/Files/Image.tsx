import { Button } from '@librechat/client';
import { FileSources } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import ImagePreview from './ImagePreview';
import RemoveFile from './RemoveFile';

const Image = ({
  imageBase64,
  url,
  onDelete,
  progress = 1,
  source = FileSources.local,
  error,
  onRetry,
}: {
  imageBase64?: string;
  url?: string;
  onDelete: () => void;
  progress: number; // between 0 and 1
  source?: FileSources;
  error?: boolean;
  onRetry?: () => void;
}) => {
  const localize = useLocalize();
  return (
    <div className="group relative inline-block text-sm text-black/70 dark:text-white/90">
      <div className="relative overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-600">
        <ImagePreview source={source} imageBase64={imageBase64} url={url} progress={progress} />
        {/* Linear progress bar at bottom for consistency */}
        {typeof progress === 'number' && progress < 1 && (
          <div className="absolute bottom-0 left-0 h-1 w-full bg-surface-secondary">
            <div
              className="h-1 bg-primary transition-[width] duration-150 ease-linear"
              style={{ width: `${Math.round(progress * 100)}%` }}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)}
            />
          </div>
        )}
      </div>
      <RemoveFile onRemove={onDelete} />
      {error && onRetry && (
        <div className="absolute bottom-1 right-2">
          <Button variant="outline" size="sm" onClick={onRetry}>
            {localize('com_agents_error_retry')}
          </Button>
        </div>
      )}
    </div>
  );
};

export default Image;
