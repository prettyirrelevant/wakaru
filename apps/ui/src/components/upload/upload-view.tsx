import { useState } from 'react';
import { DropZone } from './drop-zone';
import { BankPicker } from './bank-picker';
import { CurrencyPicker } from './currency-picker';
import { PasswordPrompt } from './password-prompt';
import { ImportResult } from './import-result';
import { Progress } from '~/components/ui';
import { SettingsSheet } from '~/components/settings/settings-sheet';
import { useStatementUpload } from '~/hooks/useStatementUpload';

export function UploadView() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const upload = useStatementUpload();

  return (
    <div className="flex min-h-screen flex-col px-4 py-6">
      <header className="flex items-center justify-between">
        <img src="/logo.png" alt="Wakaru" className="h-8 sm:h-12" />
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="tui-btn-ghost px-2 py-1 text-xs"
          aria-label="Settings"
        >
          [cfg]
        </button>
      </header>

      {upload.isProcessing && upload.status.stage === 'parsing' && (
        <div className="tui-box mt-4 space-y-2 p-3">
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
          className="tui-box mt-4 border-destructive/30 bg-destructive-muted p-3 text-xs text-destructive"
        >
          <span className="mr-2 text-muted-foreground">err:</span>
          {upload.status.message}
        </div>
      )}

      {upload.status.stage === 'complete' && (
        <ImportResult summary={upload.status.summary} className="mt-4" />
      )}

      <div className="mt-8 flex flex-1 flex-col items-center justify-center gap-8">
        <div className="space-y-2 text-center">
          <p className="text-sm text-muted-foreground">know where your money went</p>
          <p className="text-xs text-muted-foreground/70">
            your bank statement never leaves your device
          </p>
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

        <div className="w-full max-w-sm space-y-3">
          <BankPicker selectedBank={upload.selectedBank} onSelectBank={upload.setSelectedBank} />
          {upload.selectedBank && (
            <CurrencyPicker value={upload.currency} onChange={upload.setCurrency} />
          )}
          {upload.currencyWarning && (
            <p className="text-xs text-warning">{upload.currencyWarning}</p>
          )}
        </div>

        {!upload.selectedBank && (
          <p className="text-center text-xs text-muted-foreground">
            <span className="text-accent">hint:</span> select your bank first
          </p>
        )}
      </div>

      <footer className="mt-auto pt-8 text-center">
        <p className="text-xs text-muted-foreground/50">
          <a
            href={`https://github.com/prettyirrelevant/wakaru/commit/${__GIT_SHA__}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-muted-foreground"
          >
            {__GIT_SHA__}
          </a>
          {' · your data stays here'}
        </p>
      </footer>

      <SettingsSheet isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
}
