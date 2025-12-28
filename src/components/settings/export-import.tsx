import { useState, useRef, type ChangeEvent } from 'react';
import { Button } from '~/components/ui';
import { useTransactionStore } from '~/stores/transactions';
import { encryptBackup, decryptBackup, downloadBackup } from '~/lib/crypto';

interface ExportImportProps {
  onComplete?: () => void;
}

export function ExportImport({ onComplete }: ExportImportProps) {
  const [mode, setMode] = useState<'idle' | 'export' | 'import'>('idle');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const transactions = useTransactionStore((s) => s.transactions);
  const addParsedTransactions = useTransactionStore((s) => s.addParsedTransactions);

  const handleExport = async () => {
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsProcessing(true);
    setError('');

    try {
      const blob = await encryptBackup(transactions, password);
      downloadBackup(blob);
      setMode('idle');
      setPassword('');
      setConfirmPassword('');
      onComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) {
      setError('Please select a file');
      return;
    }
    if (!password) {
      setError('Please enter the backup password');
      return;
    }

    setIsProcessing(true);
    setError('');

    try {
      const imported = await decryptBackup(selectedFile, password);
      await addParsedTransactions(imported);
      setMode('idle');
      setPassword('');
      setSelectedFile(null);
      onComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setError('');
    }
  };

  if (mode === 'idle') {
    return (
      <div className="space-y-2">
        <Button
          variant="secondary"
          className="w-full justify-start"
          onClick={() => setMode('export')}
          disabled={transactions.length === 0}
        >
          Export backup
        </Button>
        <Button
          variant="secondary"
          className="w-full justify-start"
          onClick={() => {
            setMode('import');
            setError('');
          }}
        >
          Import backup
        </Button>
      </div>
    );
  }

  if (mode === 'export') {
    return (
      <div className="space-y-4 rounded-lg bg-muted p-4">
        <div className="flex items-center justify-between">
          <h4 className="font-medium">Export Backup</h4>
          <button
            onClick={() => {
              setMode('idle');
              setPassword('');
              setConfirmPassword('');
              setError('');
            }}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>

        <p className="text-sm text-muted-foreground">
          Create a password to encrypt your backup. You'll need this password to restore.
        </p>

        <div className="space-y-3">
          <input
            type="password"
            placeholder="Password (min 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-foreground focus:outline-none"
          />
          <input
            type="password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-foreground focus:outline-none"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          onClick={handleExport}
          disabled={isProcessing || !password || !confirmPassword}
          className="w-full"
        >
          {isProcessing ? 'Encrypting...' : 'Download Backup'}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg bg-muted p-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium">Import Backup</h4>
        <button
          onClick={() => {
            setMode('idle');
            setPassword('');
            setSelectedFile(null);
            setError('');
          }}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>

      <p className="text-sm text-muted-foreground">
        Select your .wakaru backup file and enter the password.
      </p>

      <div className="space-y-3">
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".wakaru"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            className="w-full"
          >
            {selectedFile ? selectedFile.name : 'Select backup file'}
          </Button>
        </div>

        <input
          type="password"
          placeholder="Backup password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-foreground focus:outline-none"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        onClick={handleImport}
        disabled={isProcessing || !selectedFile || !password}
        className="w-full"
      >
        {isProcessing ? 'Decrypting...' : 'Restore Backup'}
      </Button>
    </div>
  );
}
