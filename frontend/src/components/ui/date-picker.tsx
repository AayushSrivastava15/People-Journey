'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { Calendar as CalendarIcon, ChevronDown, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

export interface DatePickerProps {
  value?: string; // Expects "YYYY-MM-DD" or ISO string
  onChange?: (date: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  name?: string;
  className?: string;
  'aria-label'?: string;
}

/**
 * Safely parses a "YYYY-MM-DD" or ISO string into a local Date object.
 * Uses local midday to prevent date shifting due to timezone offsets.
 */
function parseLocalDate(dateStr?: string): Date | undefined {
  if (!dateStr || typeof dateStr !== 'string' || !dateStr.trim()) return undefined;
  const trimmed = dateStr.trim();

  // 1. Match YYYY-MM-DD or ISO strings starting with YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10) - 1;
    const d = parseInt(isoMatch[3], 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      const dt = new Date(y, m, d, 12, 0, 0);
      if (!isNaN(dt.getTime())) return dt;
    }
  }

  // 2. Match DD-MMM-YYYY or DD-MM-YYYY (e.g. 10-Nov-2026 or 10/11/2026)
  const dmyMatch = trimmed.match(/^(\d{1,2})[-/ ]([A-Za-z0-9]{3,})[-/ ](\d{4})/);
  if (dmyMatch) {
    const d = parseInt(dmyMatch[1], 10);
    const mStr = dmyMatch[2].toLowerCase();
    const y = parseInt(dmyMatch[3], 10);
    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const mIdx = isNaN(Number(mStr)) ? monthNames.indexOf(mStr.slice(0, 3)) : parseInt(mStr, 10) - 1;
    if (mIdx >= 0 && mIdx <= 11 && !isNaN(d) && !isNaN(y)) {
      const dt = new Date(y, mIdx, d, 12, 0, 0);
      if (!isNaN(dt.getTime())) return dt;
    }
  }

  // 3. Fallback standard Date parsing, forced to local midday
  const fallback = new Date(trimmed);
  if (!isNaN(fallback.getTime())) {
    return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate(), 12, 0, 0);
  }
  return undefined;
}

/**
 * Formats a Date object into "YYYY-MM-DD" string.
 */
function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Select date',
  disabled = false,
  required,
  id,
  name,
  className,
  'aria-label': ariaLabel,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selectedDate = React.useMemo(() => parseLocalDate(value), [value]);

  const handleSelect = (date: Date | undefined) => {
    if (date) {
      onChange?.(toISODate(date));
      setOpen(false);
    } else {
      onChange?.('');
    }
  };

  const handleClear = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    onChange?.('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          name={name}
          disabled={disabled}
          aria-label={ariaLabel || placeholder}
          aria-required={required}
          className={cn(
            'date-picker-trigger',
            open && 'is-open',
            !selectedDate && 'is-placeholder',
            className,
          )}
        >
          <div className="flex items-center gap-2 overflow-hidden">
            <CalendarIcon className="h-4 w-4 shrink-0 text-[#a87185]" />
            <span className="truncate">
              {selectedDate ? format(selectedDate, 'MMM d, yyyy') : placeholder}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {selectedDate && !disabled && (
              <span
                role="button"
                tabIndex={0}
                onClick={handleClear}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    handleClear(e);
                  }
                }}
                className="p-0.5 rounded-full hover:bg-[#f2e6e9] text-[#9b8a92] hover:text-[#5c4c55] cursor-pointer transition-colors"
                title="Clear date"
                aria-label="Clear date"
              >
                <X size={13} />
              </span>
            )}
            <ChevronDown
              size={14}
              className={cn(
                'text-[#9b8a92] transition-transform duration-200',
                open && 'rotate-180',
              )}
            />
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[284px] p-2.5 border border-[#eee3e2] bg-[#fffdfa] rounded-2xl shadow-xl overflow-hidden z-50"
        align="start"
        sideOffset={6}
      >
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleSelect}
          autoFocus
          className="w-full bg-[#fffdfa] text-[#3a2d36] rounded-xl p-1"
        />
      </PopoverContent>
    </Popover>
  );
}
