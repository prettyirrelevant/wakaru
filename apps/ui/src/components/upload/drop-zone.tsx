import { useCallback, useState, type DragEvent, type ChangeEvent } from 'react';
import { cn } from '~/lib/utils';
import { ACCEPTED_FILE_TYPES } from '~/lib/constants';
import type { FileFormat } from '~/types';
import { Icon } from '~/components/ui/icon';

interface DropZoneProps {
  onFileSelect: (file: File) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
  fileFormat?: FileFormat;
}

const FORMAT_LABELS: Record<FileFormat, string> = {
  pdf: 'PDF',
  excel: 'Excel',
  csv: 'CSV',
};

const FORMAT_EXTENSIONS: Record<FileFormat, string[]> = {
  pdf: ['.pdf'],
  excel: ['.xlsx', '.xls'],
  csv: ['.csv'],
};

const FORMAT_ACCEPT: Record<FileFormat, string> = {
  pdf: 'application/pdf,.pdf',
  excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,.xlsx,.xls',
  csv: 'text/csv,application/csv,.csv',
};

function validateFileFormat(file: File, expectedFormat: FileFormat): boolean {
  const fileName = file.name.toLowerCase();
  const validExtensions = FORMAT_EXTENSIONS[expectedFormat];
  return validExtensions.some(ext => fileName.endsWith(ext));
}

export function DropZone({ onFileSelect, onError, disabled, fileFormat }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = useCallback((file: File) => {
    if (fileFormat && !validateFileFormat(file, fileFormat)) {
      onError?.(`expected ${FORMAT_LABELS[fileFormat]} file`);
      return;
    }
    onFileSelect(file);
  }, [fileFormat, onFileSelect, onError]);

  const handleDragOver = useCallback((e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLLabelElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (disabled) return;

      const file = e.dataTransfer.files[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile, disabled]
  );

  const handleFileInput = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFile(file);
      }
      e.target.value = '';
    },
    [handleFile]
  );

  const acceptTypes = fileFormat ? FORMAT_ACCEPT[fileFormat] : ACCEPTED_FILE_TYPES;

  return (
    <label
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        'group relative block w-full focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2 focus-within:ring-offset-background',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      )}
    >
      <div
        className={cn(
          'flex min-h-40 flex-col items-center justify-center border border-dashed px-5 py-6 text-center',
          'transition-[background-color,border-color,transform] duration-150 ease-out',
          !disabled && 'group-hover:border-accent/60 group-hover:bg-accent/[0.04]',
          isDragging && 'scale-[0.99] border-accent bg-accent/[0.07]'
        )}
      >
        <Icon
          name="upload"
          className={cn(
            'mb-3 h-7 w-7 transition-colors duration-150',
            isDragging ? 'text-accent' : 'text-muted-foreground group-hover:text-accent'
          )}
        />
        <p className="text-sm font-semibold">
          {isDragging ? 'release to upload' : 'drop a statement here'}
        </p>
        <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
          {isDragging
              ? 'the import starts when you release the file.'
              : `or browse your device. ${fileFormat ? `${FORMAT_LABELS[fileFormat]} files only.` : 'PDF, Excel, and CSV files work.'}`}
        </p>
        <span className="mt-3 border border-border bg-surface px-3 py-1.5 text-xs font-semibold">
          [browse files]
        </span>
      </div>

      <input
        name="statement"
        aria-label="Choose a bank statement"
        type="file"
        accept={acceptTypes}
        onChange={handleFileInput}
        disabled={disabled}
        className="sr-only"
      />
    </label>
  );
}
