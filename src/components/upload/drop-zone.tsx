import { useCallback, useState, type DragEvent, type ChangeEvent } from 'react';
import { cn } from '~/lib/utils';
import { ACCEPTED_FILE_TYPES } from '~/lib/constants';
import type { FileFormat } from '~/types';

interface DropZoneProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
  fileFormat?: FileFormat;
}

const FORMAT_LABELS: Record<FileFormat, string> = {
  pdf: '.pdf',
  excel: '.xlsx',
  csv: '.csv',
};

export function DropZone({ onFileSelect, disabled, fileFormat }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (disabled) return;

      const file = e.dataTransfer.files[0];
      if (file) {
        onFileSelect(file);
      }
    },
    [onFileSelect, disabled]
  );

  const handleFileInput = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        onFileSelect(file);
      }
      e.target.value = '';
    },
    [onFileSelect]
  );

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        'relative w-full max-w-sm',
        disabled && 'pointer-events-none opacity-50'
      )}
    >
      <label className="flex cursor-pointer flex-col">
        {/* ASCII art box */}
        <div
          className={cn(
            'tui-box p-6 transition-colors',
            isDragging && 'border-accent bg-accent/5'
          )}
        >
          {/* Top decoration */}
          <div className="text-muted-foreground text-xs text-center mb-4">
            ╭───────────────────────────╮
          </div>

          {/* Upload icon as ASCII */}
          <div className="text-center space-y-2">
            <pre className={cn(
              'text-xs leading-tight inline-block text-left',
              isDragging ? 'text-accent' : 'text-muted-foreground'
            )}>
{`   ▲
  ╱│╲
 ╱ │ ╲
   │
───┴───`}
            </pre>
          </div>

          {/* Text */}
          <div className="text-center mt-4 space-y-1">
            <p className="text-xs">
              {isDragging ? (
                <span className="text-accent">release to upload</span>
              ) : (
                <>
                  <span className="text-foreground">drop</span>
                  <span className="text-muted-foreground"> or </span>
                  <span className="text-foreground">tap</span>
                  <span className="text-muted-foreground"> to upload</span>
                </>
              )}
            </p>
            <p className="text-xs text-muted-foreground/70">
              {fileFormat ? FORMAT_LABELS[fileFormat] : '.xlsx · .csv · .pdf'}
            </p>
          </div>

          {/* Bottom decoration */}
          <div className="text-muted-foreground text-xs text-center mt-4">
            ╰───────────────────────────╯
          </div>
        </div>

        <input
          type="file"
          accept={ACCEPTED_FILE_TYPES}
          onChange={handleFileInput}
          disabled={disabled}
          className="sr-only"
        />
      </label>
    </div>
  );
}
