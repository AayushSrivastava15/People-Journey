import React, { useState, useRef, useEffect } from 'react';
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  ArrowDownLeft,
  DoorOpen,
  MessageSquareText,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import {
  useNotifications,
  useMarkNotificationAsRead,
  useMarkAllNotificationsAsRead,
} from '@/api/queries';
import type { UserNotificationItem } from '@/types/api';

interface NotificationBellDropdownProps {
  onNavigate: (path: string) => void;
}

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Recently';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) return 'Just now';
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
  } catch {
    return 'Recently';
  }
}

function getNotificationVisuals(type: string) {
  switch (type?.toLowerCase()) {
    case 'offboarding':
      return {
        Icon: ArrowDownLeft,
        style: { color: '#c25e2e', background: '#fef3ec', border: '1px solid #fcdcc9' },
      };
    case 'onboarding':
      return {
        Icon: DoorOpen,
        style: { color: '#7964a2', background: '#f4effa', border: '1px solid #e8def4' },
      };
    case 'exit_management':
    case 'exit_interview':
      return {
        Icon: MessageSquareText,
        style: { color: '#b67c90', background: '#fbf0f3', border: '1px solid #f1d8e1' },
      };
    default:
      return {
        Icon: Bell,
        style: { color: '#b78628', background: '#fdf8eb', border: '1px solid #f6e9c5' },
      };
  }
}

function getTargetRoute(type: string): string {
  switch (type?.toLowerCase()) {
    case 'offboarding':
      return '/dashboard/offboarding';
    case 'onboarding':
      return '/dashboard/onboarding';
    case 'exit_management':
    case 'exit_interview':
      return '/dashboard/interview-responses';
    default:
      return '/dashboard/notifications';
  }
}

export function NotificationBellDropdown({ onNavigate }: NotificationBellDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { data: notifData, isLoading } = useNotifications();
  const markAsRead = useMarkNotificationAsRead();
  const markAllAsRead = useMarkAllNotificationsAsRead();

  const unreadCount = notifData?.unreadCount ?? 0;
  const notifications = notifData?.notifications ?? [];

  // Hover handlers with debounce to prevent accidental closure
  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 280);
  };

  // Toggle on click/tap
  const handleToggleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsOpen(prev => !prev);
  };

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  const handleItemClick = (item: UserNotificationItem) => {
    if (!item.isRead) {
      markAsRead.mutate(item.id);
    }
    setIsOpen(false);
    onNavigate(getTargetRoute(item.type));
  };

  const handleMarkAllRead = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (unreadCount > 0 && !markAllAsRead.isPending) {
      markAllAsRead.mutate();
    }
  };

  const handleViewAll = () => {
    setIsOpen(false);
    onNavigate('/dashboard/notifications');
  };

  return (
    <div
      ref={containerRef}
      className="notif-dropdown-wrapper"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        className={`topbar-bell ${isOpen ? 'is-active' : ''}`}
        onClick={handleToggleClick}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={
          unreadCount > 0
            ? `Notifications (${unreadCount} unread)`
            : 'Notifications'
        }
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <i aria-hidden="true">{unreadCount > 9 ? '9+' : unreadCount}</i>
        )}
      </button>

      {isOpen && (
        <div
          className="notif-popover"
          role="dialog"
          aria-label="Recent notifications"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {/* Popover Header */}
          <div className="notif-popover-header">
            <div className="notif-popover-title">
              <Bell size={15} style={{ color: '#8a6575' }} />
              <span>Notifications</span>
              {unreadCount > 0 && (
                <span className="notif-unread-chip">
                  {unreadCount} new
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                className="notif-mark-all-btn"
                onClick={handleMarkAllRead}
                disabled={markAllAsRead.isPending}
                title="Mark all as read"
              >
                {markAllAsRead.isPending ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <CheckCheck size={13} />
                )}
                <span>Mark all as read</span>
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div className="notif-list">
            {isLoading && notifications.length === 0 ? (
              <div className="notif-empty-state">
                <Loader2 size={24} className="animate-spin" style={{ color: '#b67c90', marginBottom: '8px' }} />
                <p className="notif-empty-desc">Loading notifications…</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="notif-empty-state">
                <div className="notif-empty-icon">
                  <CheckCircle2 size={22} />
                </div>
                <h4 className="notif-empty-title">All caught up!</h4>
                <p className="notif-empty-desc">No notifications right now.</p>
              </div>
            ) : (
              notifications.slice(0, 5).map(item => {
                const { Icon, style } = getNotificationVisuals(item.type);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`notif-item ${!item.isRead ? 'is-unread' : ''}`}
                    onClick={() => handleItemClick(item)}
                    title="Click to view details"
                  >
                    <div className="notif-item-icon" style={style}>
                      <Icon size={16} />
                    </div>

                    <div className="notif-item-content">
                      <div className="notif-item-head">
                        <span className="notif-item-title">{item.title}</span>
                        <span className="notif-item-time">
                          {formatRelativeTime(item.createdAt)}
                        </span>
                      </div>
                      <p className="notif-item-msg">{item.message}</p>
                    </div>

                    {!item.isRead && (
                      <span
                        className="notif-unread-dot"
                        aria-label="Unread notification"
                      />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Popover Footer */}
          <div className="notif-popover-footer">
            <button
              type="button"
              className="notif-footer-link"
              onClick={handleViewAll}
            >
              <span>View all notifications</span>
              <ArrowRight size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

