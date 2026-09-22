import { motion, AnimatePresence, useDragControls, type PanInfo } from 'framer-motion';
import { forwardRef, useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cn } from '~/lib/utils';
import { Icon } from './icon';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  title?: string;
  instant?: boolean;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
const DRAWER_MEDIA = '(min-width: 480px)';

export const BottomSheet = forwardRef<HTMLDivElement, BottomSheetProps>(
  ({ isOpen, onClose, children, className, title, instant = false }, ref) => {
    const dragControls = useDragControls();
    const sheetRef = useRef<HTMLDivElement | null>(null);
    const previouslyFocused = useRef<HTMLElement | null>(null);
    const titleId = useId();
    const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(DRAWER_MEDIA).matches);

    useEffect(() => {
      const query = window.matchMedia(DRAWER_MEDIA);
      const update = () => setIsDesktop(query.matches);
      update();
      query.addEventListener('change', update);
      return () => query.removeEventListener('change', update);
    }, []);

    const setRefs = useCallback(
      (node: HTMLDivElement | null) => {
        sheetRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      },
      [ref]
    );

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
      const previousOverflow = document.body.style.overflow;
      const previousOverscroll = document.body.style.overscrollBehavior;
      document.body.style.overflow = 'hidden';
      document.body.style.overscrollBehavior = 'none';

      return () => {
        document.removeEventListener('keydown', handleKeyDown, true);
        document.body.style.overflow = previousOverflow;
        document.body.style.overscrollBehavior = previousOverscroll;
        previouslyFocused.current?.focus?.();
      };
    }, [isOpen, onClose]);

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
              transition={{ duration: instant ? 0 : 0.16, ease: 'easeOut' }}
            />

            <motion.div
              ref={setRefs}
              role="dialog"
              aria-modal="true"
              aria-labelledby={title ? titleId : undefined}
              aria-label={title ? undefined : 'Dialog'}
              tabIndex={-1}
              data-bottom-sheet
              initial={{
                transform: isDesktop ? 'translateX(100%)' : 'translateY(100%)',
              }}
              animate={{ transform: 'translate(0, 0)' }}
              exit={{
                transform: isDesktop ? 'translateX(100%)' : 'translateY(100%)',
              }}
              transition={instant ? { duration: 0 } : { type: 'spring', duration: 0.26, bounce: 0.04 }}
              drag={isDesktop ? false : 'y'}
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
                'fixed inset-x-0 bottom-0 z-50 flex max-h-[88vh] flex-col border-t border-border bg-background shadow-2xl outline-none',
                'min-[480px]:inset-y-0 min-[480px]:left-auto min-[480px]:right-0 min-[480px]:max-h-none min-[480px]:w-full min-[480px]:max-w-[460px] min-[480px]:border-l min-[480px]:border-t-0',
                className
              )}
              style={{
                overscrollBehavior: 'contain',
                willChange: 'transform',
              }}
            >
              {title && (
                <span id={titleId} className="sr-only">
                  {title}
                </span>
              )}

              <div
                onPointerDown={(e) => dragControls.start(e)}
                className="flex shrink-0 touch-none cursor-grab items-center justify-center py-3 active:cursor-grabbing min-[480px]:h-6 min-[480px]:cursor-default"
                aria-hidden="true"
              >
                <div className="h-px w-10 bg-muted-foreground/40 min-[480px]:hidden" />
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="absolute right-4 top-3 z-10 flex h-9 w-9 touch-manipulation items-center justify-center border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground active:scale-[0.97] min-[480px]:top-4"
              >
                <Icon name="x" className="h-4 w-4" />
              </button>

              {children}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    );
  }
);

BottomSheet.displayName = 'BottomSheet';
