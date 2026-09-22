import { useEffect, useRef } from 'react';
import { tinykeys, type KeybindingsMap } from 'tinykeys';

export function useTinykeys(bindings: KeybindingsMap, disabled = false) {
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;
  const keyList = Object.keys(bindings).sort().join('|');

  useEffect(() => {
    if (disabled) return;

    const stableBindings = Object.fromEntries(
      keyList.split('|').map((key) => [key, (event: KeyboardEvent) => bindingsRef.current[key]?.(event)])
    );

    return tinykeys(window, stableBindings);
  }, [disabled, keyList]);
}
