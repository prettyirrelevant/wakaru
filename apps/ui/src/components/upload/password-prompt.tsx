interface PasswordPromptProps {
  fileName: string;
  password: string;
  onPasswordChange: (value: string) => void;
  error: string | null;
  onUnlock: () => void;
  onCancel: () => void;
  disabled?: boolean;
}

export function PasswordPrompt({
  fileName,
  password,
  onPasswordChange,
  error,
  onUnlock,
  onCancel,
  disabled,
}: PasswordPromptProps) {
  return (
    <form
      className="tui-box w-full space-y-5 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (password) onUnlock();
      }}
    >
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Selected File</p>
        <p className="truncate text-sm font-semibold">{fileName}</p>
      </div>

      <div className="space-y-2">
        <label htmlFor="statement-password" className="block text-xs text-muted-foreground">
          Enter the PDF Password
        </label>
        <input
          id="statement-password"
          type="password"
          name="statement-password"
          autoComplete="off"
          placeholder="Enter password…"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'statement-password-error' : undefined}
          className="tui-input w-full text-base sm:text-sm"
        />
        {error && (
          <p id="statement-password-error" role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 border border-border px-3 py-2 text-xs hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!password || disabled}
          className="flex-1 bg-accent px-3 py-2 text-xs text-accent-foreground disabled:opacity-50"
        >
          Unlock Statement
        </button>
      </div>
    </form>
  );
}
