import type { Employee } from '@app/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ApiError } from '@/lib/api';

import { deleteEmployee } from './api';
import { Modal } from './Modal';

// Confirmation dialog for the row-level Delete action. Row clicks never
// fire the DELETE directly - this confirmation is what protects the
// persona from accidentally destroying records by mis-clicking during
// scrolling (the test explicitly asserts this two-step flow).

type DeleteConfirmDialogProps = {
  open: boolean;
  onClose: () => void;
  employee: Employee | null;
};

export const DeleteConfirmDialog = ({
  open,
  onClose,
  employee,
}: DeleteConfirmDialogProps) => {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: () => deleteEmployee(employee!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      onClose();
    },
    onError: (err) => {
      setError(
        err instanceof ApiError ? err.message : 'Failed to delete employee.',
      );
    },
  });

  if (!employee) return null;

  return (
    <Modal open={open} onClose={onClose} title="Delete employee">
      <p className="text-sm text-slate-600">
        Are you sure you want to delete{' '}
        <strong>{employee.fullName}</strong>? This action cannot be undone.
      </p>

      {error && (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={deleteMutation.isPending}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => deleteMutation.mutate()}
          disabled={deleteMutation.isPending}
          className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </Modal>
  );
};
