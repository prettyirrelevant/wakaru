import { useEffect } from 'react';
import { BottomSheet, Progress } from '~/components/ui';
import { DropZone } from './drop-zone';
import { BankPicker } from './bank-picker';
import { CurrencyPicker } from './currency-picker';
import { PasswordPrompt } from './password-prompt';
import { ImportResult } from './import-result';
import { useStatementUpload } from '~/hooks/useStatementUpload';

interface UploadSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UploadSheet({ isOpen, onClose }: UploadSheetProps) {
  const upload = useStatementUpload({ enabled: isOpen });
  const { reset } = upload;

  useEffect(() => {
    if (!isOpen) reset();
  }, [isOpen, reset]);

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Add statement">
      <div className="overflow-y-auto px-4 pb-6">
        <div className="mb-4 flex items-center gap-2">
          <span className="text-accent">$</span>
          <h2 className="text-sm font-semibold">add statement</h2>
        </div>

        {upload.isProcessing && upload.status.stage === 'parsing' && (
          <div className="tui-box mb-4 space-y-2 p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{upload.status.message}</span>
              <span className="mono-nums">{upload.status.progress}%</span>
            </div>
            <Progress value={upload.status.progress} />
          </div>
        )}

        {upload.status.stage === 'error' && (
          <div
            role="alert"
            className="tui-box mb-4 border-destructive/30 bg-destructive-muted p-3 text-xs text-destructive"
          >
            <span className="mr-2 text-muted-foreground">err:</span>
            {upload.status.message}
          </div>
        )}

        {upload.status.stage === 'complete' && (
          <div className="mb-4 space-y-3">
            <ImportResult
              summary={upload.status.summary}
              suggestions={upload.status.suggestions}
            />
            <button
              onClick={onClose}
              className="tui-btn-primary w-full px-3 py-2 text-xs"
              autoFocus
            >
              done
            </button>
          </div>
        )}

        {upload.status.stage !== 'complete' && (
          <>
            <div className="mb-4 space-y-3">
              <BankPicker
                selectedBank={upload.selectedBank}
                onSelectBank={upload.setSelectedBank}
              />
              {upload.selectedBank && (
                <CurrencyPicker value={upload.currency} onChange={upload.setCurrency} />
              )}
              {upload.currencyWarning && (
                <p className="text-xs text-warning">{upload.currencyWarning}</p>
              )}
            </div>

            {upload.pendingFile ? (
              <PasswordPrompt
                fileName={upload.pendingFile.name}
                password={upload.password}
                onPasswordChange={upload.setPassword}
                error={upload.passwordError}
                onUnlock={upload.unlock}
                onCancel={upload.cancelPending}
                disabled={upload.isProcessing}
              />
            ) : (
              <DropZone
                onFileSelect={upload.selectFile}
                onError={upload.fail}
                disabled={upload.isProcessing || !upload.selectedBank}
                fileFormat={upload.selectedBankInfo?.fileFormat}
              />
            )}

            {!upload.selectedBank && (
              <p className="mt-3 text-center text-xs text-muted-foreground">
                <span className="text-accent">hint:</span> select your bank first
              </p>
            )}
          </>
        )}
      </div>
    </BottomSheet>
  );
}
