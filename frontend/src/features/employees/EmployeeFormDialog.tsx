import type { Employee } from '@app/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { ApiError } from '@/lib/api';

import {
  createEmployee,
  updateEmployee,
  type CreateEmployeeBody,
} from './api';
import { Modal } from './Modal';

// Single dialog handles both create and edit. If an `employee` prop is
// supplied we are in edit mode (title shows the name, mutation is PATCH);
// otherwise we are in create mode (title is "Add Employee", mutation is
// POST). Keeping one component avoids duplicating six form fields across
// two near-identical files.

const DEPARTMENTS = [
  'ENGINEERING',
  'PRODUCT',
  'DESIGN',
  'SALES',
  'MARKETING',
  'CUSTOMER_SUPPORT',
  'FINANCE',
  'HR',
  'OPERATIONS',
  'LEGAL',
  'OTHER',
] as const;

const EMPLOYMENT_TYPES = [
  'FULL_TIME',
  'PART_TIME',
  'CONTRACT',
  'INTERN',
] as const;

const emptyValues = (): CreateEmployeeBody => ({
  email: '',
  fullName: '',
  jobTitle: '',
  country: '',
  department: 'ENGINEERING',
  salary: '',
  employmentType: 'FULL_TIME',
  hireDate: '',
});

const fromEmployee = (employee: Employee): CreateEmployeeBody => ({
  email: employee.email,
  fullName: employee.fullName,
  jobTitle: employee.jobTitle,
  country: employee.country,
  department: employee.department,
  salary: employee.salary,
  employmentType: employee.employmentType,
  hireDate: employee.hireDate,
});

type EmployeeFormDialogProps = {
  open: boolean;
  onClose: () => void;
  employee?: Employee | null;
};

export const EmployeeFormDialog = ({
  open,
  onClose,
  employee,
}: EmployeeFormDialogProps) => {
  const queryClient = useQueryClient();
  const isEdit = Boolean(employee);

  const [values, setValues] = useState<CreateEmployeeBody>(emptyValues);
  const [error, setError] = useState<string | null>(null);

  // Reset form state every time the dialog opens. Without this, the same
  // dialog instance would carry stale state from a previous open.
  useEffect(() => {
    if (!open) return;
    setValues(employee ? fromEmployee(employee) : emptyValues());
    setError(null);
  }, [open, employee]);

  const createMutation = useMutation({
    mutationFn: createEmployee,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      onClose();
    },
    onError: (err) => {
      setError(
        err instanceof ApiError ? err.message : 'Failed to create employee.',
      );
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => updateEmployee(employee!.id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      onClose();
    },
    onError: (err) => {
      setError(
        err instanceof ApiError ? err.message : 'Failed to update employee.',
      );
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEdit) {
      updateMutation.mutate();
    } else {
      createMutation.mutate(values);
    }
  };

  const update = <K extends keyof CreateEmployeeBody>(
    key: K,
    value: CreateEmployeeBody[K],
  ) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const title = isEdit && employee ? `Edit ${employee.fullName}` : 'Add Employee';

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field
          label="Email"
          id="employee-email"
          type="email"
          value={values.email}
          onChange={(v) => update('email', v)}
          required
        />
        <Field
          label="Full Name"
          id="employee-fullName"
          value={values.fullName}
          onChange={(v) => update('fullName', v)}
          required
        />
        <Field
          label="Job Title"
          id="employee-jobTitle"
          value={values.jobTitle}
          onChange={(v) => update('jobTitle', v)}
          required
        />
        <Field
          label="Country"
          id="employee-country"
          value={values.country}
          onChange={(v) => update('country', v.toUpperCase())}
          placeholder="US"
          maxLength={2}
          required
        />
        <SelectField
          label="Department"
          id="employee-department"
          value={values.department}
          onChange={(v) => update('department', v)}
          options={DEPARTMENTS}
        />
        <Field
          label="Salary"
          id="employee-salary"
          value={values.salary}
          onChange={(v) => update('salary', v)}
          placeholder="100000.00"
          required
        />
        <SelectField
          label="Employment Type"
          id="employee-employmentType"
          value={values.employmentType ?? 'FULL_TIME'}
          onChange={(v) => update('employmentType', v)}
          options={EMPLOYMENT_TYPES}
        />
        <Field
          label="Hire Date"
          id="employee-hireDate"
          type="date"
          value={values.hireDate}
          onChange={(v) => update('hireDate', v)}
          required
        />

        {error && (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {isPending ? 'Saving…' : isEdit ? 'Save' : 'Add'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

type FieldProps = {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  maxLength?: number;
};

const Field = ({
  label,
  id,
  value,
  onChange,
  type = 'text',
  required,
  placeholder,
  maxLength,
}: FieldProps) => (
  <div>
    <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
      {label}
    </label>
    <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      placeholder={placeholder}
      maxLength={maxLength}
      className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
    />
  </div>
);

type SelectFieldProps = {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
};

const SelectField = ({
  label,
  id,
  value,
  onChange,
  options,
}: SelectFieldProps) => (
  <div>
    <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
      {label}
    </label>
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  </div>
);
