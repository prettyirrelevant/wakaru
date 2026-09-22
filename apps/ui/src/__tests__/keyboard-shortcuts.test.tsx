import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useKeyboardShortcuts } from '~/hooks/useKeyboardShortcuts';

function ShortcutHarness({
  onAddStatement,
  onOpenChat,
}: {
  onAddStatement: () => void;
  onOpenChat: () => void;
}) {
  useKeyboardShortcuts({
    onAddStatement,
    onOpenChat,
    onOpenSettings: vi.fn(),
    onShowHelp: vi.fn(),
  });

  return <input aria-label="Field" />;
}

describe('keyboard shortcuts', () => {
  it('opens import and chat actions with modifier shortcuts', () => {
    const onAddStatement = vi.fn();
    const onOpenChat = vi.fn();
    render(<ShortcutHarness onAddStatement={onAddStatement} onOpenChat={onOpenChat} />);

    fireEvent.keyDown(window, { key: 'u', code: 'KeyU', ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(window, { key: 'a', code: 'KeyA', ctrlKey: true, shiftKey: true });

    expect(onAddStatement).toHaveBeenCalledOnce();
    expect(onOpenChat).toHaveBeenCalledOnce();
  });

  it('ignores shortcuts inside form fields', () => {
    const onAddStatement = vi.fn();
    const onOpenChat = vi.fn();
    const { getByRole } = render(
      <ShortcutHarness onAddStatement={onAddStatement} onOpenChat={onOpenChat} />
    );

    fireEvent.keyDown(getByRole('textbox'), {
      key: 'u',
      code: 'KeyU',
      ctrlKey: true,
      shiftKey: true,
    });

    expect(onAddStatement).not.toHaveBeenCalled();
  });
});
