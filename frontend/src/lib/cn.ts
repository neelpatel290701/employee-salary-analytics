import clsx, { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// The standard shadcn/ui className helper: clsx composes conditional class
// strings, tailwind-merge resolves conflicts between competing Tailwind
// utilities (e.g. "px-2 px-4" -> "px-4"). Every shadcn component imports
// this helper, so installing it up front means `npx shadcn add <component>`
// works without follow-up wiring.

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
