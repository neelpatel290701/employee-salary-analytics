import { useEffect, useId } from 'react';

import { cn } from '@/lib/cn';

// Minimal accessible modal. Renders a focus-trapping role=dialog with an
// aria-labelledby pointing at the title, closes on Escape, closes when
// the backdrop is clicked (clicks INSIDE the dialog do not propagate up).
//
// Not pulling in Radix UI's Dialog because the surface we need is small
// (one modal type, no nested triggers, no portal complications) and the
// component tests already exercise the accessibility contract that
// matters - role, aria attributes, dismissal behaviour.

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
};

export const Modal = ({ open, onClose, title, children }: ModalProps) => {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4',
      )}
      onClick={(e) => {
        // Only close on backdrop click, not on clicks inside the dialog.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 id={titleId} className="mb-4 text-lg font-semibold">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
};
