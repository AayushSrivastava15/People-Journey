import React, { useState, useMemo } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from '@/components/ui/select';
import { Clock, Globe, Search } from 'lucide-react';

export interface TimezoneOption {
  value: string;
  label: string;
  city: string;
  offset: string;
  region: 'Americas' | 'Europe & Africa' | 'Asia & Pacific' | 'Universal';
}

export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  // Universal
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)', city: 'UTC', offset: 'UTC+00:00', region: 'Universal' },

  // Asia & Pacific
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST · Mumbai, Delhi, Bengaluru)', city: 'Mumbai / Delhi', offset: 'UTC+05:30', region: 'Asia & Pacific' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (GST · Dubai, Abu Dhabi)', city: 'Dubai', offset: 'UTC+04:00', region: 'Asia & Pacific' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (SGT · Singapore)', city: 'Singapore', offset: 'UTC+08:00', region: 'Asia & Pacific' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST · Tokyo)', city: 'Tokyo', offset: 'UTC+09:00', region: 'Asia & Pacific' },
  { value: 'Asia/Bangkok', label: 'Asia/Bangkok (ICT · Bangkok, Jakarta)', city: 'Bangkok', offset: 'UTC+07:00', region: 'Asia & Pacific' },
  { value: 'Asia/Hong_Kong', label: 'Asia/Hong_Kong (HKT · Hong Kong)', city: 'Hong Kong', offset: 'UTC+08:00', region: 'Asia & Pacific' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney (AEST/AEDT · Sydney, Melbourne)', city: 'Sydney', offset: 'UTC+10:00 / +11:00', region: 'Asia & Pacific' },
  { value: 'Pacific/Auckland', label: 'Pacific/Auckland (NZST/NZDT · Auckland)', city: 'Auckland', offset: 'UTC+12:00 / +13:00', region: 'Asia & Pacific' },

  // Europe & Africa
  { value: 'Europe/London', label: 'Europe/London (GMT/BST · London)', city: 'London', offset: 'UTC+00:00 / +01:00', region: 'Europe & Africa' },
  { value: 'Europe/Paris', label: 'Europe/Paris (CET/CEST · Paris)', city: 'Paris', offset: 'UTC+01:00 / +02:00', region: 'Europe & Africa' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin (CET/CEST · Berlin, Frankfurt)', city: 'Berlin', offset: 'UTC+01:00 / +02:00', region: 'Europe & Africa' },
  { value: 'Europe/Amsterdam', label: 'Europe/Amsterdam (CET/CEST · Amsterdam)', city: 'Amsterdam', offset: 'UTC+01:00 / +02:00', region: 'Europe & Africa' },
  { value: 'Europe/Dublin', label: 'Europe/Dublin (IST/GMT · Dublin)', city: 'Dublin', offset: 'UTC+00:00 / +01:00', region: 'Europe & Africa' },
  { value: 'Africa/Johannesburg', label: 'Africa/Johannesburg (SAST · Johannesburg)', city: 'Johannesburg', offset: 'UTC+02:00', region: 'Europe & Africa' },

  // Americas
  { value: 'America/New_York', label: 'America/New_York (Eastern Time · New York, Atlanta)', city: 'New York', offset: 'UTC-05:00 / -04:00', region: 'Americas' },
  { value: 'America/Chicago', label: 'America/Chicago (Central Time · Chicago, Dallas)', city: 'Chicago', offset: 'UTC-06:00 / -05:00', region: 'Americas' },
  { value: 'America/Denver', label: 'America/Denver (Mountain Time · Denver, Phoenix)', city: 'Denver', offset: 'UTC-07:00 / -06:00', region: 'Americas' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (Pacific Time · San Francisco, LA)', city: 'Los Angeles', offset: 'UTC-08:00 / -07:00', region: 'Americas' },
  { value: 'America/Toronto', label: 'America/Toronto (Eastern Time · Toronto)', city: 'Toronto', offset: 'UTC-05:00 / -04:00', region: 'Americas' },
  { value: 'America/Sao_Paulo', label: 'America/Sao_Paulo (BRT · São Paulo)', city: 'São Paulo', offset: 'UTC-03:00', region: 'Americas' },
];

export function getBrowserTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && TIMEZONE_OPTIONS.some(opt => opt.value === tz)) {
      return tz;
    }
    // Check if it exists in any known IANA
    return tz || 'Asia/Kolkata';
  } catch {
    return 'Asia/Kolkata';
  }
}

interface TimezoneSelectProps {
  value?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export function TimezoneSelect({ value, onChange, disabled, className = '' }: TimezoneSelectProps) {
  const [search, setSearch] = useState('');

  // Find currently selected
  const activeValue = value || 'UTC';
  const selectedOption = useMemo(() => {
    return TIMEZONE_OPTIONS.find(opt => opt.value === activeValue) || {
      value: activeValue,
      label: activeValue,
      city: activeValue,
      offset: '',
      region: 'Universal' as const,
    };
  }, [activeValue]);

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return TIMEZONE_OPTIONS;
    const q = search.toLowerCase();
    return TIMEZONE_OPTIONS.filter(
      opt =>
        opt.value.toLowerCase().includes(q) ||
        opt.label.toLowerCase().includes(q) ||
        opt.city.toLowerCase().includes(q) ||
        opt.offset.toLowerCase().includes(q)
    );
  }, [search]);

  // Group by region
  const grouped = useMemo(() => {
    const groups: Record<string, TimezoneOption[]> = {};
    filteredOptions.forEach(opt => {
      if (!groups[opt.region]) groups[opt.region] = [];
      groups[opt.region].push(opt);
    });
    return groups;
  }, [filteredOptions]);

  return (
    <Select value={activeValue} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        className={`w-full h-10 px-3.5 py-2.5 rounded-xl border border-[#e5d4d9] bg-white text-xs text-[#3d2f38] shadow-xs focus:ring-2 focus:ring-[#bd7b92]/30 focus:border-[#bd7b92] transition-colors ${className}`}
        aria-label="Select company timezone"
      >
        <div className="flex items-center gap-2 truncate">
          <Clock size={15} className="text-[#a8959d] shrink-0" />
          <SelectValue placeholder="Select timezone…">
            <span className="font-medium text-[#3d2f38] truncate">{selectedOption.label}</span>
          </SelectValue>
        </div>
      </SelectTrigger>

      <SelectContent className="max-h-80 w-[380px] bg-white border border-[#ebdada] rounded-2xl shadow-xl p-2 z-[9999]">
        <div className="p-1 mb-1.5 border-b border-[#f3e7e9] flex items-center gap-2">
          <Search size={14} className="text-[#9c8c96]" />
          <input
            type="text"
            placeholder="Search timezone or city…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full text-xs bg-transparent border-none outline-none text-[#3d2f38] placeholder-[#9c8c96]"
            onClick={e => e.stopPropagation()}
            onKeyDown={e => e.stopPropagation()}
          />
        </div>

        {Object.keys(grouped).length === 0 ? (
          <div className="p-4 text-center text-xs text-[#8c7b85]">
            No timezones match "{search}"
          </div>
        ) : (
          Object.entries(grouped).map(([region, items]) => (
            <SelectGroup key={region}>
              <SelectLabel className="px-2 py-1 text-[10px] font-bold tracking-wider uppercase text-[#935269] bg-[#fffafb] rounded-md my-0.5">
                {region}
              </SelectLabel>
              {items.map(tz => (
                <SelectItem
                  key={tz.value}
                  value={tz.value}
                  className="rounded-lg text-xs py-2 px-2.5 my-0.5 cursor-pointer hover:bg-[#faf0f4] focus:bg-[#faf0f4] text-[#3d2f38] data-[state=checked]:bg-[#f6e6ed] data-[state=checked]:font-semibold data-[state=checked]:text-[#8c5369]"
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{tz.value}</span>
                    <span className="text-[10px] text-[#786671]">{tz.city} · {tz.offset}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectGroup>
          ))
        )}
      </SelectContent>
    </Select>
  );
}

