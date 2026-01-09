import { useState, useEffect } from 'react';
import { useSettingsStore } from '~/stores/settings';
import { TuiLoadingDots } from '~/components/ui';

export function LocalServerConfig() {
  const chatMode = useSettingsStore((s) => s.chatMode);
  const setLocalServerUrl = useSettingsStore((s) => s.setLocalServerUrl);
  const setLocalServerModel = useSettingsStore((s) => s.setLocalServerModel);
  const testLocalConnection = useSettingsStore((s) => s.testLocalConnection);
  const disconnectLocalServer = useSettingsStore((s) => s.disconnectLocalServer);

  if (chatMode.type !== 'local') return null;

  const { status, url, model, models, error } = chatMode;
  const [inputUrl, setInputUrl] = useState(url);

  useEffect(() => {
    setInputUrl(url);
  }, [url]);

  const handleTest = () => {
    setLocalServerUrl(inputUrl);
    setTimeout(() => testLocalConnection(), 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && inputUrl.trim()) {
      handleTest();
    }
  };

  return (
    <div className="space-y-3 pt-1">
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">server</label>
        <input
          type="text"
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="http://localhost:11434/v1"
          disabled={status === 'testing'}
          className="w-full tui-input text-xs"
        />
      </div>

      {status === 'idle' && (
        <>
          <button
            onClick={handleTest}
            disabled={!inputUrl.trim()}
            className="w-full text-xs px-3 py-2 border bg-muted border-border hover:border-border-strong transition-colors disabled:opacity-50"
          >
            [ test connection ]
          </button>
          <p className="text-xs text-muted-foreground/50">
            any openai-compatible api
          </p>
        </>
      )}

      {status === 'testing' && (
        <div className="tui-box p-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">testing connection</span>
            <TuiLoadingDots />
          </div>
        </div>
      )}

      {status === 'connected' && (
        <>
          <div className="tui-box border-success/30 bg-success/5 p-3">
            <p className="text-xs text-success">
              <span className="mr-1.5">●</span>
              connected · {models.length} model{models.length !== 1 ? 's' : ''} available
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">model</label>
            <select
              value={model}
              onChange={(e) => setLocalServerModel(e.target.value)}
              className="w-full tui-input text-xs bg-muted"
            >
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={disconnectLocalServer}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            [ forget server ]
          </button>
        </>
      )}

      {status === 'error' && (
        <>
          <div className="tui-box border-destructive/30 bg-destructive/5 p-3">
            <p className="text-xs text-destructive">
              <span className="mr-1.5">✗</span>
              {error}
            </p>
          </div>
          <button
            onClick={handleTest}
            disabled={!inputUrl.trim()}
            className="w-full text-xs px-3 py-2 border bg-muted border-border hover:border-border-strong disabled:opacity-50"
          >
            [ retry ]
          </button>
        </>
      )}
    </div>
  );
}
