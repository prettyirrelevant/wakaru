import { motion, AnimatePresence, useDragControls, type PanInfo } from 'framer-motion';
import { forwardRef, useEffect, type ReactNode } from 'react';
import { cn } from '~/lib/utils';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

export const BottomSheet = forwardRef<HTMLDivElement, BottomSheetProps>(
  ({ isOpen, onClose, children, className }, ref) => {
    const dragControls = useDragControls();

    // Prevent pull-to-refresh when sheet is open
    useEffect(() => {
      if (!isOpen) return;

      const preventDefault = (e: TouchEvent) => {
        // Only prevent if we're at the top of the sheet
        const target = e.target as HTMLElement;
        const sheet = target.closest('[data-bottom-sheet]');
        if (sheet && sheet.scrollTop === 0) {
          // Allow the drag gesture but prevent pull-to-refresh
          if (e.touches.length === 1) {
            const touch = e.touches[0];
            const startY = touch.clientY;
            
            const onMove = (moveEvent: TouchEvent) => {
              const currentY = moveEvent.touches[0].clientY;
              // If dragging down from top, prevent default
              if (currentY > startY && sheet.scrollTop === 0) {
                moveEvent.preventDefault();
              }
            };
            
            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('touchend', () => {
              document.removeEventListener('touchmove', onMove);
            }, { once: true });
          }
        }
      };

      document.addEventListener('touchstart', preventDefault, { passive: true });
      
      // Also prevent overscroll on body
      document.body.style.overflow = 'hidden';
      document.body.style.overscrollBehavior = 'none';

      return () => {
        document.removeEventListener('touchstart', preventDefault);
        document.body.style.overflow = '';
        document.body.style.overscrollBehavior = '';
      };
    }, [isOpen]);

    return (
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 z-40 bg-black/40"
            />

            {/* Sheet */}
            <motion.div
              ref={ref}
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
                'fixed inset-x-0 bottom-0 z-50 flex max-h-[70vh] flex-col rounded-t-2xl bg-background',
                className
              )}
              style={{ 
                overscrollBehavior: 'contain',
                willChange: 'transform',
                transform: 'translateZ(0)',
              }}
            >
              {/* Drag handle */}
              <div
                onPointerDown={(e) => dragControls.start(e)}
                className="flex items-center justify-center py-3 cursor-grab active:cursor-grabbing touch-none"
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
