'use client';

import React, { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  subtext?: string;
  badge?: string;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface AnimatedSelectProps {
  options: (SelectOption | string)[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  icon?: ReactNode;
  variant?: 'filter' | 'form';
  className?: string;
  style?: React.CSSProperties;
  id?: string;
  name?: string;
  required?: boolean;
  'aria-label'?: string;
}

/**
 * AnimatedSelect provides a luxury, theme-matching custom dropdown
 * with smooth Framer Motion open/close transitions, floating portal rendering,
 * and keyboard accessibility.
 */
export function AnimatedSelect({
  options,
  value,
  onChange,
  placeholder = 'Select an option…',
  disabled = false,
  icon,
  variant = 'form',
  className = '',
  style,
  id,
  name,
  required,
  'aria-label': ariaLabel,
}: AnimatedSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; placeAbove: boolean }>({
    top: 0,
    left: 0,
    width: 0,
    placeAbove: false,
  });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();

  // Normalize options into SelectOption objects
  const normalizedOptions: SelectOption[] = React.useMemo(() => {
    return options.map(opt => {
      if (typeof opt === 'string') {
        return { value: opt, label: opt };
      }
      return opt;
    });
  }, [options]);

  // Find currently selected option
  const selectedOption = normalizedOptions.find(opt => opt.value === value);

  // Position calculation
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const dropdownHeight = Math.min(normalizedOptions.length * 42 + 20, 260);
    const spaceBelow = window.innerHeight - rect.bottom;
    const placeAbove = spaceBelow < dropdownHeight && rect.top > dropdownHeight;

    const calculatedWidth = Math.max(rect.width, variant === 'filter' ? 200 : rect.width);
    const maxLeft = typeof window !== 'undefined' ? Math.max(8, window.innerWidth - calculatedWidth - 12) : rect.left;
    const clampedLeft = Math.max(8, Math.min(rect.left, maxLeft));

    setCoords({
      top: placeAbove ? rect.top - 6 : rect.bottom + 6,
      left: clampedLeft,
      width: calculatedWidth,
      placeAbove,
    });
  }, [normalizedOptions.length, variant]);

  // Handle open/close toggling
  const handleToggle = () => {
    if (disabled) return;
    if (!isOpen) {
      updatePosition();
      const currentIndex = normalizedOptions.findIndex(opt => opt.value === value);
      setHighlightedIndex(currentIndex >= 0 ? currentIndex : 0);
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleScrollOrResize = () => {
      updatePosition();
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [isOpen, updatePosition]);

  // Keyboard accessibility
  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        updatePosition();
        const currentIndex = normalizedOptions.findIndex(opt => opt.value === value);
        setHighlightedIndex(currentIndex >= 0 ? currentIndex : 0);
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'Escape':
      case 'Tab':
        setIsOpen(false);
        break;
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => {
          let next = prev + 1;
          while (next < normalizedOptions.length && normalizedOptions[next].disabled) {
            next++;
          }
          return next < normalizedOptions.length ? next : prev;
        });
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => {
          let next = prev - 1;
          while (next >= 0 && normalizedOptions[next].disabled) {
            next--;
          }
          return next >= 0 ? next : prev;
        });
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < normalizedOptions.length) {
          const opt = normalizedOptions[highlightedIndex];
          if (!opt.disabled) {
            onChange?.(opt.value);
            setIsOpen(false);
          }
        }
        break;
    }
  };

  const handleSelectOption = (opt: SelectOption) => {
    if (opt.disabled) return;
    onChange?.(opt.value);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const isFilter = variant === 'filter';

  return (
    <div
      className={`animated-select-container ${isFilter ? 'animated-select-filter' : 'animated-select-form'} ${className}`}
      style={{
        position: 'relative',
        display: isFilter ? 'inline-flex' : 'block',
        width: isFilter ? 'auto' : '100%',
        ...style,
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        id={id}
        name={name}
        disabled={disabled}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel || placeholder}
        className={`animated-select-trigger ${isOpen ? 'is-open' : ''}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: isFilter ? '8px' : '12px',
          width: '100%',
          minHeight: isFilter ? '36px' : '40px',
          padding: isFilter ? '0 12px 0 10px' : '0 14px',
          background: isFilter ? '#fffdfa' : '#fffdfa',
          color: selectedOption ? '#3a2d36' : '#9b8a92',
          border: `1px solid ${isOpen ? '#bd7b92' : '#eee3e2'}`,
          borderRadius: isFilter ? '9px' : '10px',
          fontSize: isFilter ? '11px' : '12px',
          fontWeight: isFilter ? 600 : 500,
          fontFamily: 'inherit',
          cursor: disabled ? 'not-allowed' : 'pointer',
          boxShadow: isOpen
            ? '0 0 0 3px rgba(189, 123, 146, 0.16)'
            : '0 1px 2px rgba(88, 64, 76, 0.04)',
          transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
          outline: 'none',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {icon && <span style={{ color: '#a7788c', display: 'flex', alignItems: 'center' }}>{icon}</span>}
          {selectedOption?.icon && (
            <span style={{ color: '#a7788c', display: 'flex', alignItems: 'center' }}>
              {selectedOption.icon}
            </span>
          )}
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: selectedOption ? '#3c2e38' : '#9f8e97',
            }}
          >
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </span>

        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#a998a1',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: shouldReduceMotion ? 'none' : 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <ChevronDown size={isFilter ? 13 : 15} />
        </span>
      </button>

      {/* Render Dropdown Portal */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {isOpen && (
              <motion.div
                ref={menuRef}
                role="listbox"
                aria-label={ariaLabel || placeholder}
                initial={
                  shouldReduceMotion
                    ? { opacity: 0 }
                    : {
                        opacity: 0,
                        scale: 0.96,
                        y: coords.placeAbove ? 6 : -6,
                      }
                }
                animate={
                  shouldReduceMotion
                    ? { opacity: 1 }
                    : {
                        opacity: 1,
                        scale: 1,
                        y: 0,
                      }
                }
                exit={
                  shouldReduceMotion
                    ? { opacity: 0 }
                    : {
                        opacity: 0,
                        scale: 0.96,
                        y: coords.placeAbove ? 6 : -6,
                      }
                }
                transition={{
                  duration: 0.16,
                  ease: [0.16, 1, 0.3, 1],
                }}
                style={{
                  position: 'fixed',
                  top: coords.placeAbove ? undefined : coords.top,
                  bottom: coords.placeAbove ? window.innerHeight - coords.top : undefined,
                  left: coords.left,
                  width: coords.width,
                  maxHeight: '260px',
                  zIndex: 9999,
                  background: '#ffffff',
                  border: '1px solid #ebdada',
                  borderRadius: '12px',
                  boxShadow:
                    '0 14px 34px -4px rgba(78, 48, 62, 0.15), 0 4px 12px -2px rgba(78, 48, 62, 0.06)',
                  overflowY: 'auto',
                  padding: '6px',
                  fontFamily: 'inherit',
                  transformOrigin: coords.placeAbove ? 'bottom left' : 'top left',
                }}
              >
                {normalizedOptions.map((opt, index) => {
                  const isSelected = opt.value === value;
                  const isHighlighted = highlightedIndex === index;

                  return (
                    <div
                      key={opt.value || `opt-${index}`}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleSelectOption(opt)}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        cursor: opt.disabled ? 'not-allowed' : 'pointer',
                        background: isSelected
                          ? '#f8e6ed'
                          : isHighlighted
                          ? '#fdf2f6'
                          : 'transparent',
                        color: isSelected ? '#7a2b46' : '#493a44',
                        fontWeight: isSelected ? 600 : 500,
                        fontSize: '11px',
                        lineHeight: 1.4,
                        transition: 'background 0.12s ease, color 0.12s ease',
                        opacity: opt.disabled ? 0.45 : 1,
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <span
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '7px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {opt.icon && (
                            <span style={{ color: isSelected ? '#a85d76' : '#9b8a92' }}>
                              {opt.icon}
                            </span>
                          )}
                          <span>{opt.label}</span>
                        </span>
                        {opt.subtext && (
                          <span
                            style={{
                              fontSize: '9.5px',
                              color: isSelected ? '#9b5d72' : '#94838d',
                              marginTop: '2px',
                              fontWeight: 400,
                            }}
                          >
                            {opt.subtext}
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        {opt.badge !== undefined && (
                          <span
                            style={{
                              fontSize: '10px',
                              padding: '2px 7px',
                              borderRadius: '999px',
                              background: isSelected ? '#ebd3dc' : '#f0e6eb',
                              color: isSelected ? '#7a2b46' : '#7d6c76',
                              fontWeight: 600,
                            }}
                          >
                            {opt.badge}
                          </span>
                        )}
                        {isSelected && (
                          <motion.span
                            initial={shouldReduceMotion ? false : { scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ duration: 0.15 }}
                            style={{ color: '#974862', display: 'flex', alignItems: 'center' }}
                          >
                            <Check size={14} strokeWidth={2.2} />
                          </motion.span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}
