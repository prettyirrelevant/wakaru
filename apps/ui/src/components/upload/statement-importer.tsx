import { useEffect } from 'react';
import { BankPicker } from './bank-picker';
import { CurrencyPicker } from './currency-picker';
import { DropZone } from './drop-zone';
import { ImportResult } from './import-result';
import { PasswordPrompt } from './password-prompt';
import { Progress } from '~/components/ui/progress';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { useStatementUpload } from '~/hooks/useStatementUpload';
import { cn } from '~/lib/utils';

interface StatementImporterProps {
  enabled?: boolean;
  onDone?: () => void;
  className?: string;
}

export function StatementImporter({
  enabled = true,
  onDone,
  className,
}: StatementImporterProps) {
  const upload = useStatementUpload({ enabled });
  const { reset } = upload;
  const status = upload.status;
  const isComplete = status.stage === 'complete';
  const step = isComplete ? 3 : upload.selectedBank ? 2 : 1;

  useEffect(() => {
    if (!enabled) reset();
  }, [enabled, reset]);

  return (
    <div className={cn('space-y-6', className)}>
      <ImportSteps current={step} />

      {status.stage === 'complete' ? (
        <div className="space-y-4">
          <ImportResult
            summary={status.summary}
            suggestions={status.suggestions}
          />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={reset}>
              Import Another
            </Button>
            {onDone && (
              <Button type="button" onClick={onDone}>
                View Dashboard
                <Icon name="arrow-right" className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {!upload.selectedBank && (
            <BankPicker onSelectBank={upload.setSelectedBank} />
          )}

          {upload.selectedBank && (
            <section className="space-y-4" aria-labelledby="statement-step-title">
              <h2 id="statement-step-title" className="sr-only">add statement</h2>
              <div className="flex flex-wrap items-center justify-between gap-3 border border-border bg-muted/30 px-3 py-2.5">
                <p className="min-w-0 text-xs">
                  <span className="font-semibold text-foreground">
                    {upload.selectedBankInfo?.name}
                  </span>
                  <span className="ml-2 uppercase text-muted-foreground">
                    {upload.selectedBankInfo?.fileFormat}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => upload.setSelectedBank(null)}
                  className="text-[11px] font-semibold text-accent underline underline-offset-4 hover:no-underline"
                >
                  change bank
                </button>
              </div>

              <div className="flex items-center justify-between gap-4">
                <p className="text-xs text-muted-foreground">account details</p>
                <CurrencyPicker value={upload.currency} onChange={upload.setCurrency} />
              </div>

              {upload.currencyWarning && (
                <p role="alert" className="border border-warning/30 bg-warning-muted p-3 text-xs leading-5 text-warning">
                  {upload.currencyWarning}
                </p>
              )}

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
                  disabled={upload.isProcessing}
                  fileFormat={upload.selectedBankInfo?.fileFormat}
                />
              )}
            </section>
          )}

          {upload.isProcessing && upload.status.stage === 'parsing' && (
            <div className="border border-accent/20 bg-accent/[0.06] p-4" role="status">
              <div className="mb-2 flex items-center justify-between gap-4 text-xs">
                <span className="font-medium">{upload.status.message}</span>
                <span className="mono-nums text-muted-foreground">{upload.status.progress}%</span>
              </div>
              <Progress value={upload.status.progress} />
            </div>
          )}

          {upload.status.stage === 'error' && (
            <div role="alert" className="border border-destructive/30 bg-destructive-muted p-4 text-xs leading-5 text-destructive">
              <p className="font-semibold">err: statement import failed</p>
              <p className="mt-1">{upload.status.message}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ImportSteps({ current }: { current: number }) {
  const steps = ['select bank', 'add statement', 'review'];

  return (
    <div className="flex items-center justify-between gap-4 border-b border-border pb-3 text-xs">
      <span className="mono-nums text-muted-foreground">step 0{current}/03</span>
      <span className="font-semibold text-foreground">{steps[current - 1]}</span>
    </div>
  );
}
