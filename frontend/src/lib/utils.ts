/**
 * Utility: cn (class name merger)
 * ---------------------------------
 * Combines Tailwind classes safely, merging conflicting utilities correctly.
 * Required by all components using conditional Tailwind classes.
 *
 * Usage: className={cn('base-class', condition && 'conditional-class')}
 */

import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
