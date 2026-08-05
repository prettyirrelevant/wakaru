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
      className="tui-box w-full max-w-sm space-y-4 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (password) onUnlock();
      }}
    >
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">selected file</p>
        <p className="truncate text-sm">{fileName}</p>
      </div>

      <div className="space-y-2">
        <label htmlFor="statement-password" className="block text-xs text-muted-foreground">
          this pdf is password protected
        </label>
        <input
          id="statement-password"
          type="password"
          placeholder="enter password"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'statement-password-error' : undefined}
          className="w-full border border-border bg-background px-3 py-2 text-base focus:border-accent focus:outline-none sm:text-sm"
          autoFocus
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
          cancel
        </button>
        <button
          type="submit"
          disabled={!password || disabled}
          className="flex-1 bg-accent px-3 py-2 text-xs text-accent-foreground disabled:opacity-50"
        >
          unlock
        </button>
      </div>
    </form>
  );
}
