import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UploadView } from '~/components/upload/upload-view';

vi.mock('~/components/upload/statement-importer', () => ({
  StatementImporter: () => <div>statement importer</div>,
}));

vi.mock('~/components/settings/settings-sheet', () => ({
  SettingsSheet: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div role="dialog" aria-label="Settings" /> : null,
}));

describe('UploadView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens settings from the cfg control', async () => {
    const user = userEvent.setup();
    render(<UploadView />);

    await user.click(screen.getByRole('button', { name: 'Open settings' }));

    expect(await screen.findByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
  });
});
