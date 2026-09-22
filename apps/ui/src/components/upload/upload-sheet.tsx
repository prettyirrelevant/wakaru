import { BottomSheet } from '~/components/ui/bottom-sheet';
import { StatementImporter } from './statement-importer';

interface UploadSheetProps {
  isOpen: boolean;
  onClose: () => void;
  instant?: boolean;
}

export function UploadSheet({ isOpen, onClose, instant }: UploadSheetProps) {
  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Add statement" instant={instant}>
      <div className="overflow-y-auto px-5 pb-8 sm:px-8">
        <div className="mb-6">
          <p className="text-xs text-accent">$ import</p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">add statement</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            your file stays in this browser while wakaru builds your ledger.
          </p>
        </div>
        <StatementImporter enabled={isOpen} onDone={onClose} />
      </div>
    </BottomSheet>
  );
}
