import { useState, useEffect } from 'react';
import { useSettingsStore } from '~/stores/settings';
import { Button } from '~/components/ui/button';

export function LocalServerConfig() {
  const chatMode = useSettingsStore((s) => s.chatMode);
  const setLocalServerUrl = useSettingsStore((s) => s.setLocalServerUrl);
  const setLocalServerModel = useSettingsStore((s) => s.setLocalServerModel);
  const testLocalConnection = useSettingsStore((s) => s.testLocalConnection);
  const disconnectLocalServer = useSettingsStore((s) => s.disconnectLocalServer);

  const isLocal = chatMode.type === 'local';
  const url = isLocal ? chatMode.url : '';
  const [inputUrl, setInputUrl] = useState(url);

  useEffect(() => {
    if (isLocal) {
      setInputUrl(chatMode.url);
    }
  }, [isLocal, chatMode]);

  if (!isLocal) return null;

  const { status, model, models, error } = chatMode;

  const handleTest = () => {
    setLocalServerUrl(inputUrl);
    void testLocalConnection();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || !inputUrl.trim()) return;
    event.preventDefault();
    handleTest();
  };

  return (
    <div className="space-y-3 pt-1">
      <div className="space-y-1.5">
        <label htmlFor="local-server-url" className="text-xs font-medium text-muted-foreground">Server URL</label>
        <input
          id="local-server-url"
          name="local-server-url"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
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
          <Button
            variant="secondary"
            size="sm"
            onClick={handleTest}
            disabled={!inputUrl.trim()}
            className="w-full"
          >
            Test Connection
          </Button>
          <p className="text-xs text-muted-foreground">
            Use any OpenAI-compatible local server.
          </p>
        </>
      )}

      {status === 'testing' && (
        <div className="tui-box p-3" role="status">
          <p className="cursor-blink text-xs text-muted-foreground">testing connection </p>
        </div>
      )}

      {status === 'connected' && (
        <>
          <div className="tui-box border-success/30 bg-success/5 p-3">
            <p className="text-xs text-success">
              <span className="mr-1.5">●</span>
              Connected · {models.length} model{models.length !== 1 ? 's' : ''} available
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="local-model" className="text-xs font-medium text-muted-foreground">Model</label>
            <select
              id="local-model"
              name="local-model"
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

          <Button
            variant="ghost"
            size="sm"
            onClick={disconnectLocalServer}
            className="px-0"
          >
            Forget Server
          </Button>
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
          <Button
            variant="secondary"
            size="sm"
            onClick={handleTest}
            disabled={!inputUrl.trim()}
            className="w-full"
          >
            Retry Connection
          </Button>
        </>
      )}
    </div>
  );
}
