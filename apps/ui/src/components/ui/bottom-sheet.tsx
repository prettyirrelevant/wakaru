import { motion, AnimatePresence, useDragControls, type PanInfo } from 'framer-motion';
import { forwardRef, useCallback, useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from '~/lib/utils';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  /** Accessible name. Falls back to a generic label when omitted. */
  title?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const BottomSheet = forwardRef<HTMLDivElement, BottomSheetProps>(
  ({ isOpen, onClose, children, className, title }, ref) => {
    const dragControls = useDragControls();
    const sheetRef = useRef<HTMLDivElement | null>(null);
    const previouslyFocused = useRef<HTMLElement | null>(null);
    const titleId = useId();

    const setRefs = useCallback(
      (node: HTMLDivElement | null) => {
        sheetRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      },
      [ref]
    );

    // Escape to dismiss, and keep Tab inside the sheet while it is open.
    useEffect(() => {
      if (!isOpen) return;

      previouslyFocused.current = document.activeElement as HTMLElement | null;

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
          return;
        }

        if (event.key !== 'Tab' || !sheetRef.current) return;

        const focusable = Array.from(
          sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
        ).filter((el) => el.offsetParent !== null);

        if (focusable.length === 0) {
          event.preventDefault();
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;

        if (event.shiftKey && (active === first || !sheetRef.current.contains(active))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      };

      document.addEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = 'hidden';
      document.body.style.overscrollBehavior = 'none';

      return () => {
        document.removeEventListener('keydown', handleKeyDown, true);
        document.body.style.overflow = '';
        document.body.style.overscrollBehavior = '';
        previouslyFocused.current?.focus?.();
      };
    }, [isOpen, onClose]);

    // Move focus into the sheet once it has animated in.
    useEffect(() => {
      if (!isOpen) return;

      const timer = window.setTimeout(() => {
        const node = sheetRef.current;
        if (!node) return;
        const target = node.querySelector<HTMLElement>(FOCUSABLE) ?? node;
        target.focus({ preventScroll: true });
      }, 120);

      return () => window.clearTimeout(timer);
    }, [isOpen]);

    return (
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 z-40 bg-black/40"
              aria-hidden="true"
            />

            <motion.div
              ref={setRefs}
              role="dialog"
              aria-modal="true"
              aria-labelledby={title ? titleId : undefined}
              aria-label={title ? undefined : 'Dialog'}
              tabIndex={-1}
              data-bottom-sheet
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              drag="y"
              dragControls={dragControls}
              dragConstraints={{ top: 0 }}
              dragElastic={{ top: 0, bottom: 0.3 }}
              dragListener={false}
              onDragEnd={(_: unknown, info: PanInfo) => {
                if (info.offset.y > 80 || info.velocity.y > 400) {
                  onClose();
                }
              }}
              className={cn(
                'fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-2xl bg-background outline-none',
                className
              )}
              style={{
                overscrollBehavior: 'contain',
                willChange: 'transform',
                transform: 'translateZ(0)',
              }}
            >
              {title && (
                <span id={titleId} className="sr-only">
                  {title}
                </span>
              )}

              <div
                onPointerDown={(e) => dragControls.start(e)}
                className="flex shrink-0 items-center justify-center py-3 cursor-grab active:cursor-grabbing touch-none"
                aria-hidden="true"
              >
                <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
              </div>

              {children}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    );
  }
);

BottomSheet.displayName = 'BottomSheet';
