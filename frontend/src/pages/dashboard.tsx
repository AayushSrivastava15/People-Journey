import { useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import {
  Activity, ArrowDownLeft, ArrowRight, Bell, BriefcaseBusiness, CalendarDays, Check,
  ChevronDown, ChevronLeft, ChevronRight, CircleHelp, ClipboardCheck, Clock3, Database, DoorOpen,
  FileText, LayoutDashboard, ListFilter, Loader2, Lock, LogOut, Menu, MessageSquareText, Pencil, Search, Settings,
  ShieldCheck, UserCheck, Users, UsersRound, X,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Form } from '@/components/ui/form';
import { AnimatedSelect } from '@/components/ui/animated-select';
import { DatePicker } from '@/components/ui/date-picker';
import {
  useDashboardStats, useEmployees, useDepartments, useDesignations,
  useCreateEmployee, useOffboardEmployee,
  usePersonalDashboard, useNotifications,
} from '@/api/queries';
import type { Employee as ApiEmployee } from '@/types/api';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useAuth } from '@/context';
import { CompanyProfileCard } from '@/components/company-profile-card';
import { EmailTemplatesView } from '@/components/email-templates-view';
import { EmailNotificationsView } from '@/components/email-notifications-view';
import { EmailDraftHistoryView } from '@/components/email-draft-history-view';
import { EditEmployeeDialog } from '@/components/edit-employee-dialog';
import { ExitManagementView } from '@/components/exit-management-view';
import { NotificationBellDropdown } from '@/components/notification-bell-dropdown';


const navGroups = [
  { label: 'Overview', links: [{ label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard }] },
  { label: 'People', links: [
    { label: 'All Employees', path: '/dashboard/employees', icon: UsersRound },
    { label: 'Add Employee', path: '/dashboard/add-employee', icon: Users },
    { label: 'Onboarding', path: '/dashboard/onboarding', icon: DoorOpen },
    { label: 'Offboarding', path: '/dashboard/offboarding', icon: ArrowDownLeft },
    { label: 'Departments', path: '/dashboard/departments', icon: BriefcaseBusiness },
  ] },
  { label: 'Communication', links: [
    { label: 'Email Notifications', path: '/dashboard/notifications', icon: Bell },
    { label: 'Email Templates', path: '/dashboard/templates', icon: FileText },
    { label: 'Notification History', path: '/dashboard/notification-history', icon: Activity },
  ] },
  { label: 'Exit management', links: [
    { label: 'Exit Interviews', path: '/dashboard/exit-interviews', icon: MessageSquareText },
    { label: 'Interview Responses', path: '/dashboard/interview-responses', icon: ClipboardCheck },
  ] },
  { label: 'Preferences', links: [
    { label: 'Settings', path: '/dashboard/settings', icon: Settings },
  ] },
];

const titles: Record<string, string> = {
  '/dashboard': 'Your People Overview',
  '/dashboard/employees': 'All Employees',
  '/dashboard/add-employee': 'Add an employee',
  '/dashboard/schedule-offboarding': 'Record an exit',
  '/dashboard/onboarding': 'Onboarding',
  '/dashboard/offboarding': 'Offboarding',
  '/dashboard/departments': 'Departments',
  '/dashboard/notifications': 'Email Notifications',
  '/dashboard/templates': 'Email Templates',
  '/dashboard/notification-history': 'Notification History',
  '/dashboard/exit-interviews': 'Exit Interviews',
  '/dashboard/interview-responses': 'Interview Responses',
  '/dashboard/settings': 'Settings',
};

const statusClass: Record<string, string> = {
  Active: 'active', Onboarding: 'onboarding', Offboarding: 'offboarding', Exited: 'exited',
  Pending: 'pending', Processing: 'processing', Sent: 'sent', Failed: 'failed', Cancelled: 'cancelled',
  Invited: 'pending', Submitted: 'sent', Expired: 'cancelled',
};

export type LifecycleStatus = 'Active' | 'Onboarding' | 'Offboarding' | 'Exited';
export type NoticeStatus = 'Pending' | 'Processing' | 'Sent' | 'Failed' | 'Cancelled';

const dateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const dateFromToday = (offsetDays: number) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return dateKey(date);
};

const recentMonthBuckets = (count: number) =>
  Array.from({ length: count }, (_, index) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(1);
    date.setMonth(date.getMonth() - (count - index - 1));
    return {
      key: dateKey(date).slice(0, 7),
      label: new Intl.DateTimeFormat(undefined, { month: 'short' }).format(date),
    };
  });

const fmt = (date: string | null | undefined) => {
  if (!date) return '—';
  const clean = date.slice(0, 10);
  const parts = clean.split('-').map(Number);
  if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) return date;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(parts[0], parts[1] - 1, parts[2]));
};

export interface WorkspaceNotificationItem {
  id: string;
  employeeId: number | string;
  employeeName: string;
  type: string;
  recipient: string;
  scheduledDate: string;
  status: NoticeStatus;
  lastAttempt: string | null;
}

export interface WorkspaceExitItem {
  id: string;
  employeeId: number | string;
  employeeName: string;
  department: string;
  status: 'Invited' | 'Submitted' | 'Expired';
  expires: string;
}

function useWorkspaceLifecycleData() {
  const { data: employeesData, isLoading } = useEmployees({ limit: 100 });
  const employees = employeesData?.data || [];
  const today = dateFromToday(0);

  const notifications = useMemo(() => {
    const list: WorkspaceNotificationItem[] = [];

    for (const emp of employees) {
      const email = emp.workEmail || `${(emp.employeeCode || 'staff').toLowerCase()}@workspace.local`;
      const hireDate = emp.hireDate || today;
      const isPastOrToday = hireDate <= today;

      if (emp.status === 'Onboarding') {
        list.push({
          id: `notif-${emp.employeeId}-welcome`,
          employeeId: emp.employeeId,
          employeeName: emp.name,
          type: 'Welcome note & credentials',
          recipient: email,
          scheduledDate: hireDate,
          status: isPastOrToday ? 'Sent' : 'Pending',
          lastAttempt: isPastOrToday ? `${hireDate} 09:00` : null,
        });
        list.push({
          id: `notif-${emp.employeeId}-dayone`,
          employeeId: emp.employeeId,
          employeeName: emp.name,
          type: 'Day-one journey roadmap',
          recipient: email,
          scheduledDate: hireDate,
          status: isPastOrToday ? 'Sent' : 'Processing',
          lastAttempt: isPastOrToday ? `${hireDate} 09:15` : null,
        });
        list.push({
          id: `notif-${emp.employeeId}-checkin`,
          employeeId: emp.employeeId,
          employeeName: emp.name,
          type: 'First-week check-in',
          recipient: email,
          scheduledDate: dateFromToday(7),
          status: 'Pending',
          lastAttempt: null,
        });
      } else if (emp.status === 'Offboarding') {
        const exitDate = emp.exitDate || dateFromToday(7);
        list.push({
          id: `notif-${emp.employeeId}-exit-invite`,
          employeeId: emp.employeeId,
          employeeName: emp.name,
          type: 'Exit interview invitation',
          recipient: email,
          scheduledDate: exitDate,
          status: 'Processing',
          lastAttempt: `${today} 11:00`,
        });
        list.push({
          id: `notif-${emp.employeeId}-handover`,
          employeeId: emp.employeeId,
          employeeName: emp.name,
          type: 'Transition & asset return guidance',
          recipient: email,
          scheduledDate: exitDate,
          status: 'Pending',
          lastAttempt: null,
        });
      } else if (emp.status === 'Active') {
        list.push({
          id: `notif-${emp.employeeId}-active`,
          employeeId: emp.employeeId,
          employeeName: emp.name,
          type: 'Onboarding completed confirmation',
          recipient: email,
          scheduledDate: hireDate,
          status: 'Sent',
          lastAttempt: `${hireDate} 09:00`,
        });
      } else if (emp.status === 'Exited') {
        const exitDate = emp.exitDate || dateFromToday(-7);
        list.push({
          id: `notif-${emp.employeeId}-farewell`,
          employeeId: emp.employeeId,
          employeeName: emp.name,
          type: 'Transition completed & archived',
          recipient: email,
          scheduledDate: exitDate,
          status: 'Sent',
          lastAttempt: `${exitDate} 17:00`,
        });
      }
    }

    return list;
  }, [employees, today]);

  const exitInterviews = useMemo(() => {
    return employees
      .filter(emp => emp.status === 'Offboarding' || emp.status === 'Exited')
      .map(emp => ({
        id: `exit-${emp.employeeId}`,
        employeeId: emp.employeeId,
        employeeName: emp.name,
        department: emp.departmentName || 'General',
        status: (emp.status === 'Exited' ? 'Submitted' : 'Invited') as 'Invited' | 'Submitted' | 'Expired',
        expires: emp.exitDate || dateFromToday(14),
      }));
  }, [employees]);

  return { employees, notifications, exitInterviews, isLoading };
}

function Shell({
  children,
  title,
  path,
  onNavigate,
  searchValue,
  onSearchChange,
}: {
  children: ReactNode;
  title: string;
  path: string;
  onNavigate: (path: string) => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { user, appUser, signOut } = useAuth();
  const shouldReduceMotion = useReducedMotion();

  const handleSignOut = async () => {
    await signOut();
    onNavigate('/login');
  };

  const displayName = appUser?.displayName || user?.displayName || user?.email?.split('@')[0] || 'Workspace User';
  const avatarLetter = (displayName[0] || 'U').toUpperCase();

  return (
    <div className="dashboard-frame">
      <div className="dashboard-shell">
        <aside className={`dash-sidebar ${collapsed ? 'is-collapsed' : ''} ${menuOpen ? 'is-open' : ''}`} aria-label="Workspace navigation">
          <Link href="/dashboard" className="dash-brand">
            <span className="dash-brand-symbol" aria-hidden="true"><i /><i /><i /></span>
            <span className="dash-brand-name">people<span>journey</span><small>WORKSPACE</small></span>
          </Link>
          <div className="workspace-label">PERSONAL WORKSPACE</div>
          <nav className="dash-nav">
            {navGroups.map(group => (
              <div className="nav-group" key={group.label}>
                <p>{group.label}</p>
                {group.links.map(item => {
                  const Icon = item.icon;
                  const active = item.path === path;
                  return (
                    <Link
                      key={item.path}
                      href={item.path}
                      onClick={() => { setMenuOpen(false); onNavigate(item.path); }}
                      className={`dash-nav-link ${active ? 'active' : ''}`}
                      aria-current={active ? 'page' : undefined}
                      title={collapsed ? item.label : undefined}
                    >
                      {active && (
                        <motion.span
                          layoutId="activeSidebarPill"
                          className="dash-nav-active-pill"
                          transition={
                            shouldReduceMotion
                              ? { duration: 0 }
                              : { type: 'spring', stiffness: 420, damping: 32 }
                          }
                          aria-hidden="true"
                        />
                      )}
                      <Icon size={17} strokeWidth={1.8} className="dash-nav-icon" />
                      <span className="dash-nav-text">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="sidebar-foot">
            <span className="help-icon" style={{ background: '#f8e6ea', color: '#974d66' }}>
              <UserCheck size={16} />
            </span>
            <span style={{ minWidth: 0 }}>
              <b style={{ maxWidth: '135px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {displayName}
              </b>
              <small style={{ maxWidth: '135px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.email || 'Personal Account'}
              </small>
            </span>
          </div>
          <button className="collapse-sidebar" type="button" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            <ChevronLeft size={16} />
          </button>
        </aside>
        {menuOpen && <button className="nav-scrim" onClick={() => setMenuOpen(false)} aria-label="Close navigation" />}
        <main className="dash-main">
          <header className="dash-topbar">
            <button className="mobile-nav-toggle" aria-label="Open navigation" onClick={() => setMenuOpen(true)}>
              <Menu size={20} />
            </button>
            <div className="breadcrumbs">
              <span>Personal Workspace</span>
              <ChevronRight size={13} />
              <AnimatePresence mode="wait" initial={false}>
                <motion.strong
                  key={title}
                  initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                  animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                >
                  {title}
                </motion.strong>
              </AnimatePresence>
            </div>
            <label className="global-search">
              <Search size={16} />
              <span className="sr-only">Search your employees</span>
              <input
                value={searchValue}
                onChange={event => {
                  const value = event.target.value;
                  onSearchChange(value);
                  if (value.trim() && path !== '/dashboard/employees') onNavigate('/dashboard/employees');
                }}
                placeholder="Search your employees..."
              />
              <kbd>WORKSPACE</kbd>
            </label>
            <NotificationBellDropdown onNavigate={onNavigate} />
            <span className="topbar-date">
              {new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date())}
            </span>

            {/* Authenticated user pill & logout button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '4px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '7px',
                  padding: '4px 10px 4px 6px',
                  borderRadius: '999px',
                  background: '#fffdfb',
                  border: '1px solid #ebdada',
                  fontSize: '11px',
                  color: '#52434d',
                }}
                title={user?.email || displayName}
              >
                <span
                  style={{
                    display: 'grid',
                    placeItems: 'center',
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    background: '#f6e5e9',
                    color: '#8b4b62',
                    fontWeight: 700,
                    fontSize: '10px',
                  }}
                >
                  {avatarLetter}
                </span>
                <span style={{ maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
                  {displayName}
                </span>
                <span
                  style={{
                    padding: '2px 5px',
                    borderRadius: '4px',
                    background: '#f8ebf0',
                    color: '#93586d',
                    fontSize: '8px',
                    fontWeight: 700,
                    letterSpacing: '.05em',
                    textTransform: 'uppercase',
                  }}
                >
                  WORKSPACE
                </span>
              </div>

              <button
                type="button"
                onClick={handleSignOut}
                title="Sign out of personal workspace"
                aria-label="Sign out of personal workspace"
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  width: '35px',
                  height: '35px',
                  borderRadius: '10px',
                  border: '1px solid #eee4e4',
                  background: '#fffdfa',
                  color: '#86727d',
                  cursor: 'pointer',
                  transition: 'background-color .18s, color .18s, border-color .18s',
                }}
              >
                <LogOut size={16} />
              </button>
            </div>
          </header>
          <div className="dash-content">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={path}
                initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                transition={{
                  duration: 0.18,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="dash-tab-pane"
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>
          <footer className="dash-footer">People Journey · Personal Workspace · A thoughtful space for employee lifecycle management</footer>
        </main>
      </div>
      <span className="sr-only" aria-live="polite">{searchValue ? `Searching employee records for ${searchValue}` : ''}</span>
    </div>
  );
}

function Status({ value }: { value: LifecycleStatus | NoticeStatus | 'Invited' | 'Submitted' | 'Expired' }) {
  return <span className={`status-badge status-${statusClass[value] || 'neutral'}`}><i aria-hidden="true" />{value}</span>;
}

function PageHeading({ eyebrow, title, text, action }: { eyebrow?: string; title: string; text: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <span className="page-eyebrow">{eyebrow}</span>}<h1>{title}</h1><p>{text}</p></div>{action}</div>;
}

function EmployeeTable({
  people,
  compact = false,
  isLoading = false,
  departments = [],
  designations = [],
}: {
  people: ApiEmployee[];
  compact?: boolean;
  isLoading?: boolean;
  departments?: import('@/types/api').Department[];
  designations?: import('@/types/api').Designation[];
}) {
  const [editingEmployee, setEditingEmployee] = useState<ApiEmployee | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="table-scroll" style={{ padding: '40px 20px', textAlign: 'center', color: '#887582' }}>
        <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px auto', color: '#bd7b92' }} />
        <span>Loading your workspace employees…</span>
      </div>
    );
  }

  const handleEditClick = (employee: ApiEmployee) => {
    setEditingEmployee(employee);
    setEditDialogOpen(true);
  };

  return (
    <>
      <div className="table-scroll">
        <table className="data-table">
          <colgroup>
            <col style={{ width: compact ? '30%' : '24%' }} />
            <col style={{ width: compact ? '20%' : '16%' }} />
            <col style={{ width: compact ? '22%' : '16%' }} />
            <col style={{ width: compact ? '18%' : '12%' }} />
            {!compact && <col style={{ width: '12%' }} />}
            <col style={{ width: compact ? '10%' : '11%' }} />
            <col style={{ width: '9%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Department</th>
              <th>Role / Designation</th>
              <th>Joining Date</th>
              {!compact && <th>Last Working Day</th>}
              <th>Status</th>
              <th style={{ textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {people.map(person => {
              const id = person.employeeId;
              const name = person.name;
              const email = person.workEmail || '';
              const code = person.employeeCode || '';
              const dept = person.departmentName || 'General';
              const role = person.designationName || 'Team Member';
              const hire = person.hireDate;
              const exit = person.exitDate;
              const initials = name ? name.split(' ').map((p: string) => p[0]).join('').slice(0, 2) : 'EM';

              return (
                <tr key={String(id)}>
                  <td>
                    <span className="person-cell">
                      <span className="person-avatar">{initials}</span>
                      <span>
                        <b>{name}</b>
                        <small>{email || code || 'Registered'}</small>
                      </span>
                    </span>
                  </td>
                  <td>{dept || 'General'}</td>
                  <td>{role || 'Team Member'}</td>
                  <td>{fmt(hire)}</td>
                  {!compact && (
                    <td>
                      {exit ? fmt(exit) : <span style={{ color: '#b5a4ac' }}>—</span>}
                    </td>
                  )}
                  <td><Status value={person.status} /></td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      type="button"
                      title={`Edit ${name}`}
                      aria-label={`Edit ${name}`}
                      onClick={() => handleEditClick(person)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 30, height: 30, borderRadius: '8px',
                        border: '1px solid #eee3e2', background: '#fffdfa',
                        color: '#887582', cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLButtonElement).style.background = '#f4e4ea';
                        (e.currentTarget as HTMLButtonElement).style.color = '#bd7b92';
                        (e.currentTarget as HTMLButtonElement).style.borderColor = '#dfc9d0';
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLButtonElement).style.background = '#fffdfa';
                        (e.currentTarget as HTMLButtonElement).style.color = '#887582';
                        (e.currentTarget as HTMLButtonElement).style.borderColor = '#eee3e2';
                      }}
                    >
                      <Pencil size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {people.length === 0 && (
          <div className="table-empty">
            <UsersRound size={24} style={{ color: '#b5798e' }} />
            <b>No matching employee records</b>
            <span>No employees found in your workspace. Try adding a new employee or clearing your search filters.</span>
            <Link
              href="/dashboard/add-employee"
              className="secondary-action"
              style={{ marginTop: '6px' }}
            >
              <Users size={14} /> Add new employee
            </Link>
          </div>
        )}
      </div>

      {/* Edit Employee Dialog */}
      <EditEmployeeDialog
        employee={editingEmployee}
        open={editDialogOpen}
        onOpenChange={(o) => {
          setEditDialogOpen(o);
          if (!o) setEditingEmployee(null);
        }}
        departments={departments}
        designations={designations}
      />
    </>
  );
}


function NotificationTable({ rows }: { rows: WorkspaceNotificationItem[] }) {
  return (
    <div className="table-scroll">
      <table className="data-table">
        <colgroup>
          <col style={{ width: '22%' }} />
          <col style={{ width: '24%' }} />
          <col style={{ width: '24%' }} />
          <col style={{ width: '15%' }} />
          <col style={{ width: '15%' }} />
        </colgroup>
        <thead>
          <tr>
            <th>Employee</th>
            <th>Notification Type</th>
            <th>Recipient Email</th>
            <th>Scheduled Date</th>
            <th>Status / Delivery</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.id}>
              <td>
                <span className="person-cell">
                  <span className="person-avatar">
                    {row.employeeName.split(' ').map(p => p[0]).join('').slice(0, 2) || 'EM'}
                  </span>
                  <span>
                    <b>{row.employeeName}</b>
                    <small>Workspace Personnel</small>
                  </span>
                </span>
              </td>
              <td>
                <span style={{ fontWeight: 600, color: '#4d3d46' }}>{row.type}</span>
              </td>
              <td>
                <span style={{ color: '#685963', fontSize: '11px' }}>{row.recipient}</span>
              </td>
              <td>
                <span>{fmt(row.scheduledDate)}</span>
              </td>
              <td>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <Status value={row.status} />
                  {row.lastAttempt && (
                    <small style={{ color: '#97858f', fontSize: '9px' }}>
                      {row.lastAttempt}
                    </small>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="table-empty">
          <Bell size={24} style={{ color: '#b5798e' }} />
          <b>No notification touchpoints</b>
          <span>Notification jobs are automatically generated when you add employees to your workspace.</span>
          <Link
            href="/dashboard/add-employee"
            className="secondary-action"
            style={{ marginTop: '6px' }}
          >
            <Users size={14} /> Add an employee
          </Link>
        </div>
      )}
    </div>
  );
}

function Overview() {
  const [activityFilter, setActivityFilter] = useState('All');
  const [page, setPage] = useState(0);
  const today = dateFromToday(0);

  // Fetch live workspace stats & derived lifecycle data
  const { data: liveStats } = useDashboardStats();
  const { notifications, exitInterviews } = useWorkspaceLifecycleData();
  const { data: notifData } = useNotifications();

  const totalEmployees = liveStats ? liveStats.totalEmployees : 0;
  const joiningMonth = liveStats ? liveStats.joiningThisMonth : 0;
  const upcomingJoiners = liveStats ? liveStats.upcomingJoiners : 0;
  const upcomingExits = liveStats ? liveStats.upcomingExits : 0;
  const pendingNoticesCount = notifData?.unreadCount ?? 0;
  const completedInterviewsCount = exitInterviews.filter(p => p.status === 'Submitted').length;

  const stats = [
    { label: 'Total employees', value: totalEmployees, icon: UsersRound, tone: 'rose', href: '/dashboard/employees', note: 'In your workspace' },
    { label: 'Joining this month', value: joiningMonth, icon: CalendarDays, tone: 'peach', href: '/dashboard/onboarding', note: 'Current calendar month' },
    { label: 'Upcoming joiners', value: upcomingJoiners, icon: DoorOpen, tone: 'lilac', href: '/dashboard/onboarding', note: 'Joining within next 7 days' },
    { label: 'Upcoming exits', value: upcomingExits, icon: ArrowDownLeft, tone: 'peach', href: '/dashboard/offboarding', note: 'Exiting within next 7 days' },
    { label: 'Pending notifications', value: pendingNoticesCount, icon: Bell, tone: 'butter', href: '/dashboard/notifications', note: 'Workspace touchpoints' },
    { label: 'Completed interviews', value: completedInterviewsCount, icon: ClipboardCheck, tone: 'lilac', href: '/dashboard/interview-responses', note: 'Transition responses' },
  ];

  const statusData = liveStats?.statusDistribution || [
    { name: 'Active', value: 0 },
    { name: 'Onboarding', value: 0 },
    { name: 'Offboarding', value: 0 },
    { name: 'Exited', value: 0 },
  ];
  const colors = ['#d99bad', '#e7b993', '#bcb1d8', '#d7c9bd'];

  const activity = liveStats?.monthlyActivity || recentMonthBuckets(6).map(bucket => ({
    month: bucket.label,
    joining: 0,
    exits: 0,
  }));

  const events = liveStats?.upcomingEvents || [];

  const filteredNotices = notifications.filter(item => activityFilter === 'All' || item.status === activityFilter);
  const shownNotices = filteredNotices.slice(page * 3, page * 3 + 3);

  return (
    <>
      <PageHeading
        eyebrow="Workspace Overview"
        title="Your People Overview"
        text="Everything happening across onboarding, offboarding, and employee lifecycles."
        action={
          <div className="page-actions">
            <Link href="/dashboard/add-employee" className="primary-action"><Users size={17} /> Add Employee</Link>
            <Link href="/dashboard/schedule-offboarding" className="secondary-action"><ArrowDownLeft size={16} /> Record an Exit</Link>
          </div>
        }
      />
      <section className="kpi-grid" aria-label="Workspace summary">
        {stats.map(item => {
          const Icon = item.icon;
          return (
            <Link href={item.href} className="kpi-card" key={item.label}>
              <span className={`kpi-icon ${item.tone}`}><Icon size={19} /></span>
              <span className="kpi-label">{item.label}</span>
              <b className="kpi-value">{item.value}</b>
              <small>{item.note}</small>
              <ArrowRight className="kpi-arrow" size={15} />
            </Link>
          );
        })}
      </section>
      <div className="overview-grid">
        <section className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">LIFECYCLE ACTIVITY · LAST 6 MONTHS</span>
              <h2>Employee journey overview</h2>
              <p>Monthly new joiners and transitions across your workspace.</p>
            </div>
            <span className="chart-key"><i /> Joining <i className="key-exit" /> Exits</span>
          </div>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={activity} margin={{ top: 6, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid stroke="#f2e8e7" vertical={false} />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#95858e', fontSize: 11 }} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#a99ba2', fontSize: 10 }} />
                <Tooltip contentStyle={{ border: '1px solid #f0e5e5', borderRadius: 12, fontSize: 12, background: '#fffdfa' }} />
                <Bar dataKey="joining" name="Joining" fill="#dfabb9" radius={[5, 5, 0, 0]} />
                <Bar dataKey="exits" name="Exits" fill="#c5b9dc" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="panel distribution-panel">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">ONE STATUS PER PERSON</span>
              <h2>Status distribution</h2>
              <p>Distribution across employee lifecycle stages.</p>
            </div>
          </div>
          <div className="donut-wrap">
            <ResponsiveContainer width="100%" height={190}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={57} outerRadius={78} paddingAngle={3} stroke="none">
                  {statusData.map((entry, index) => <Cell key={entry.name} fill={colors[index % colors.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="donut-total">
              <b>{statusData.reduce((acc, curr) => acc + curr.value, 0)}</b>
              <span>people</span>
            </div>
          </div>
          <div className="distribution-legend">
            {statusData.map((entry, index) => (
              <span key={entry.name}>
                <i style={{ background: colors[index % colors.length] }} />
                {entry.name}<b>{entry.value}</b>
              </span>
            ))}
          </div>
        </section>
      </div>
      <div className="overview-grid lower-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">DATES & PLANNED TOUCHPOINTS</span>
              <h2>Today & coming up</h2>
              <p>Upcoming onboarding and offboarding dates.</p>
            </div>
            <CalendarDays size={18} className="heading-icon" />
          </div>
          <div className="event-list">
            {events.slice(0, 5).map(event => (
              <article className="event-item" key={event.id}>
                <span className="event-node" />
                <div className="event-copy">
                  <b>{event.person}</b>
                  <span>{event.label} · {fmt(event.date)}</span>
                </div>
                <Status value={event.status as LifecycleStatus | NoticeStatus} />
                <Link href={event.path} className="icon-link" aria-label={`View ${event.person} ${event.label}`}>
                  <ArrowRight size={15} />
                </Link>
              </article>
            ))}
            {events.length === 0 && <p className="empty-inline">No upcoming milestones scheduled in the next 14 days.</p>}
          </div>
        </section>
        <section className="panel quick-panel">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">A FEW USEFUL SHORTCUTS</span>
              <h2>Quick actions</h2>
              <p>Jump to employee lifecycle operations.</p>
            </div>
          </div>
          <div className="quick-links">
            <Link href="/dashboard/add-employee"><Users size={17} />Add employee<ChevronRight size={15} /></Link>
            <Link href="/dashboard/schedule-offboarding"><ArrowDownLeft size={17} />Schedule offboarding<ChevronRight size={15} /></Link>
            <Link href="/dashboard/employees"><UsersRound size={17} />View employees<ChevronRight size={15} /></Link>
            <Link href="/dashboard/exit-interviews"><MessageSquareText size={17} />Review exit interviews<ChevronRight size={15} /></Link>
            <Link href="/dashboard/templates"><FileText size={17} />Explore email templates<ChevronRight size={15} /></Link>
            <Link href="/dashboard/notification-history"><Activity size={17} />View notification logs<ChevronRight size={15} /></Link>
          </div>
        </section>
      </div>
      <section className="panel notification-panel">
        <div className="panel-heading panel-heading-wrap">
          <div>
            <span className="panel-kicker">PLANNED WORKFLOW ACTIVITY</span>
            <h2>Notification activity</h2>
            <p>Notification jobs scheduled for employee communication touchpoints.</p>
          </div>
          <AnimatedSelect
            variant="filter"
            icon={<ListFilter size={14} />}
            value={activityFilter}
            onChange={val => { setActivityFilter(val); setPage(0); }}
            options={[
              { value: 'All', label: 'All activities' },
              { value: 'Pending', label: 'Pending' },
              { value: 'Processing', label: 'Processing' },
              { value: 'Sent', label: 'Sent' },
              { value: 'Failed', label: 'Failed' },
              { value: 'Cancelled', label: 'Cancelled' },
            ]}
          />
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`notices-${activityFilter}-${page}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <NotificationTable rows={shownNotices} />
          </motion.div>
        </AnimatePresence>
        <div className="pagination">
          <span>Showing {filteredNotices.length ? page * 3 + 1 : 0}–{Math.min((page + 1) * 3, filteredNotices.length)} of {filteredNotices.length} notification jobs</span>
          <div>
            <button type="button" aria-label="Previous page" disabled={page === 0} onClick={() => setPage(Math.max(0, page - 1))}>
              <ChevronLeft size={16} />
            </button>
            <button type="button" aria-label="Next page" disabled={(page + 1) * 3 >= filteredNotices.length} onClick={() => setPage(page + 1)}>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

function ListingPage({
  path,
  globalSearch,
  setGlobalSearch,
}: {
  path: string;
  globalSearch: string;
  setGlobalSearch: (value: string) => void;
}) {
  const [status, setStatus] = useState('All statuses');
  const [page, setPage] = useState(0);
  const pageSize = 5;
  const title = titles[path] || 'Personal Workspace';

  const { notifications, exitInterviews } = useWorkspaceLifecycleData();

  if (path === '/dashboard/add-employee') return <AddEmployee />;
  if (path === '/dashboard/schedule-offboarding') return <ScheduleOffboarding />;
  if (path === '/dashboard/settings') return <SettingsPage />;
  if (path === '/dashboard/templates') return <EmailTemplatesView />;
  if (path === '/dashboard/notifications') return <EmailNotificationsView />;
  if (path === '/dashboard/notification-history') return <EmailDraftHistoryView />;
  if (path === '/dashboard/interview-responses') return <ExitManagementView mode="responses" />;

  const desc: Record<string, string> = {
    '/dashboard/employees': 'A directory of all team members and personnel in your workspace.',
    '/dashboard/onboarding': 'Employees currently in the onboarding stage.',
    '/dashboard/offboarding': 'Transition records and planned exit schedules.',
    '/dashboard/departments': 'Active departments and team distribution in your workspace.',
    '/dashboard/notifications': 'Notification touchpoints and automated communication jobs.',
    '/dashboard/notification-history': 'Audit trail and delivery history for workspace touchpoints.',
    '/dashboard/exit-interviews': 'Exit interviews and transition feedback for departing employees.',
  };

  const peopleMode = ['/dashboard/employees', '/dashboard/onboarding', '/dashboard/offboarding', '/dashboard/departments'].includes(path);
  const notificationMode = ['/dashboard/notifications', '/dashboard/notification-history'].includes(path);

  if (path === '/dashboard/exit-interviews') return <ExitManagementView mode="records" />;

  // Determine status filter for query
  const queryStatus = path === '/dashboard/onboarding' ? 'ONBOARDING'
    : path === '/dashboard/offboarding' ? 'OFFBOARDING'
    : status !== 'All statuses' ? status
    : undefined;

  // Live queries for employees & departments
  const { data: employeeData, isLoading: employeesLoading } = useEmployees({
    page: page + 1,
    limit: pageSize,
    search: globalSearch || undefined,
    status: queryStatus,
  });

  const { data: liveDepartments } = useDepartments();
  const { data: liveDesignations } = useDesignations();

  const people = employeeData?.data || [];
  const totalCount = employeeData?.total || 0;

  // Filter real notifications
  const filteredNotifications = notifications.filter(item => {
    const matchesSearch = `${item.employeeName} ${item.type} ${item.recipient}`.toLowerCase().includes(globalSearch.toLowerCase());
    const matchesStatus = status === 'All statuses' || item.status === status;
    return matchesSearch && matchesStatus;
  });

  const totalRecords = peopleMode ? totalCount : filteredNotifications.length;
  const pageCount = Math.max(1, Math.ceil(totalRecords / pageSize));

  return (
    <>
      <PageHeading
        eyebrow="Workspace Personnel"
        title={title}
        text={desc[path] || 'A clear view of employee journey records.'}
        action={peopleMode && <Link href="/dashboard/add-employee" className="primary-action"><Users size={17} /> Add Employee</Link>}
      />
      {path === '/dashboard/departments' && liveDepartments && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="department-strip"
        >
          {liveDepartments.map(dept => (
            <span key={dept.departmentId}>
              {dept.departmentName}
              <b>{dept.employeeCount || 0}</b>
            </span>
          ))}
        </motion.div>
      )}
      <section className="panel listing-panel">
        <div className="list-controls">
          <label className="list-search">
            <Search size={16} />
            <span className="sr-only">Search {title}</span>
            <input
              value={globalSearch}
              onChange={event => { setGlobalSearch(event.target.value); setPage(0); }}
              placeholder="Search name, code, department, email..."
            />
          </label>
          <AnimatedSelect
            variant="filter"
            icon={<ListFilter size={14} />}
            value={status}
            onChange={val => { setStatus(val); setPage(0); }}
            options={[
              { value: 'All statuses', label: 'All statuses' },
              ...(notificationMode
                ? ['Pending', 'Processing', 'Sent', 'Failed', 'Cancelled']
                : ['Active', 'Onboarding', 'Offboarding', 'Exited']
              ).map(val => ({ value: val, label: val })),
            ]}
          />
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${path}-${status}-${page}-${globalSearch}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {peopleMode ? (
              <EmployeeTable people={people} isLoading={employeesLoading} departments={liveDepartments || []} designations={liveDesignations || []} />
            ) : (
              <NotificationTable rows={filteredNotifications.slice(page * pageSize, (page + 1) * pageSize)} />
            )}
          </motion.div>
        </AnimatePresence>
        <div className="pagination">
          <span>
            Page {page + 1} of {pageCount} · {totalRecords} {peopleMode ? 'employees' : 'notification touchpoints'}
          </span>
          <div>
            <button type="button" aria-label="Previous page" disabled={page === 0} onClick={() => setPage(Math.max(0, page - 1))}>
              <ChevronLeft size={16} />
            </button>
            <button type="button" aria-label="Next page" disabled={page + 1 >= pageCount} onClick={() => setPage(page + 1)}>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

function ExitTable({ rows }: { rows: WorkspaceExitItem[] }) {
  return (
    <section className="panel listing-panel">
      <div className="table-scroll">
        <table className="data-table">
          <colgroup>
            <col style={{ width: '32%' }} />
            <col style={{ width: '22%' }} />
            <col style={{ width: '24%' }} />
            <col style={{ width: '22%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Interview Status</th>
              <th>Planned Exit / Expiry</th>
              <th style={{ textAlign: 'right' }}>Workflow Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const initials = row.employeeName.split(' ').map(p => p[0]).join('').slice(0, 2) || 'EM';
              return (
                <tr key={row.id}>
                  <td>
                    <span className="person-cell">
                      <span className="person-avatar">{initials}</span>
                      <span>
                        <b>{row.employeeName}</b>
                        <small>{row.department}</small>
                      </span>
                    </span>
                  </td>
                  <td>
                    <Status value={row.status} />
                  </td>
                  <td>{fmt(row.expires)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <span
                      className="text-action"
                      style={{ display: 'inline-flex', cursor: 'default' }}
                    >
                      {row.status === 'Submitted' ? 'Feedback Captured' : 'Invitation Dispatched'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="table-empty">
            <MessageSquareText size={24} style={{ color: '#b5798e' }} />
            <b>No exit interviews scheduled</b>
            <span>Exit interviews are generated automatically when you schedule an employee offboarding.</span>
            <Link
              href="/dashboard/schedule-offboarding"
              className="secondary-action"
              style={{ marginTop: '8px' }}
            >
              <ArrowDownLeft size={14} /> Record an employee exit
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

const employeeFormSchema = z.object({
  fullName: z.string().trim().min(1, 'Enter employee name.'),
  personalEmail: z.union([z.string().email('Invalid email format'), z.literal('')]),
  workEmail: z.union([z.string().email('Invalid email format'), z.literal('')]),
  department: z.string().min(1, 'Choose a department.'),
  designation: z.string().optional(),
  manager: z.string().optional(),
  joiningDate: z.string().min(1, 'Select a joining date.'),
  lastWorkingDay: z.string().optional(),
  status: z.enum(['Active', 'Onboarding', 'Offboarding', 'Exited']),
});
type EmployeeFormValues = z.infer<typeof employeeFormSchema>;

function AddEmployee() {
  const [createdEmployee, setCreatedEmployee] = useState<ApiEmployee | null>(null);
  const { data: departments } = useDepartments();
  const { data: designations } = useDesignations();
  const createMutation = useCreateEmployee();
  const { toast } = useToast();

  const defaultDepartments = ['Engineering', 'Design', 'Product', 'People', 'Operations', 'Finance', 'Marketing'];
  const deptList = departments && departments.length > 0
    ? departments.map(d => d.departmentName)
    : defaultDepartments;

  const form = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: {
      fullName: '',
      personalEmail: '',
      workEmail: '',
      department: '',
      designation: '',
      manager: '',
      joiningDate: '',
      lastWorkingDay: '',
      status: 'Onboarding',
    },
  });

  const onSubmit = async (values: EmployeeFormValues) => {
    try {
      const parts = values.fullName.trim().split(/\s+/);
      const firstName = parts[0] || 'Unknown';
      const lastName = parts.slice(1).join(' ') || '';

      const created = await createMutation.mutateAsync({
        firstName,
        lastName,
        fullName: values.fullName,
        personalEmail: values.personalEmail || undefined,
        workEmail: values.workEmail || undefined,
        department: values.department,
        designation: values.designation || undefined,
        manager: values.manager || undefined,
        hireDate: values.joiningDate,
        joiningDate: values.joiningDate,
        lastWorkingDay: values.lastWorkingDay || undefined,
        employmentStatus: values.status,
      });

      toast({
        title: 'Employee Added',
        description: `${created.name} has been successfully added to your workspace.`,
      });

      setCreatedEmployee(created);
      form.reset();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Failed to Add Employee',
        description: (err as Error).message || 'An error occurred while creating the employee.',
      });
    }
  };

  return (
    <>
      <PageHeading
        eyebrow="Create Employee Record"
        title="Add an employee"
        text="Register a new team member and begin their journey in your workspace."
      />
      <div className="form-preview-layout">
        <section className="panel form-panel">
          <Form {...form}>
            <form autoComplete="off" onSubmit={form.handleSubmit(onSubmit)}>
              <div className="form-grid">
                <div className="form-field">
                  <div className="field-label-row">
                    <label htmlFor="fullName">Full name</label>
                  </div>
                  <input id="fullName" {...form.register('fullName')} required placeholder="e.g. Avery Morgan" />
                </div>

                <div className="form-field">
                  <div className="field-label-row">
                    <label htmlFor="workEmail">Work email</label>
                  </div>
                  <input id="workEmail" {...form.register('workEmail')} type="email" placeholder="name@peoplejourney.com" />
                </div>

                <div className="form-field">
                  <div className="field-label-row">
                    <label htmlFor="personalEmail">Personal email</label>
                    <span className="field-hint">Optional</span>
                  </div>
                  <input id="personalEmail" {...form.register('personalEmail')} type="email" placeholder="name@example.com" />
                </div>

                <div className="form-field">
                  <div className="field-label-row">
                    <label htmlFor="department">Department</label>
                  </div>
                  <AnimatedSelect
                    id="department"
                    variant="form"
                    placeholder="Select department"
                    value={form.watch('department') || ''}
                    onChange={val => form.setValue('department', val, { shouldValidate: true, shouldDirty: true })}
                    options={deptList.map(dept => ({ value: dept, label: dept }))}
                  />
                </div>

                <div className="form-field">
                  <div className="field-label-row">
                    <label htmlFor="designation">Designation / Role</label>
                  </div>
                  <AnimatedSelect
                    id="designation"
                    variant="form"
                    placeholder="Select designation (optional)"
                    value={form.watch('designation') || ''}
                    onChange={val => form.setValue('designation', val, { shouldValidate: true, shouldDirty: true })}
                    options={(designations || []).map(des => ({
                      value: des.designationName,
                      label: des.designationName,
                    }))}
                  />
                </div>

                <div className="form-field">
                  <div className="field-label-row">
                    <label htmlFor="joiningDate">Joining date</label>
                  </div>
                  <DatePicker
                    id="joiningDate"
                    value={form.watch('joiningDate')}
                    onChange={val => form.setValue('joiningDate', val, { shouldValidate: true, shouldDirty: true })}
                    placeholder="Select joining date"
                    required
                  />
                </div>

                <div className="form-field">
                  <div className="field-label-row">
                    <label htmlFor="lastWorkingDay">Last working day</label>
                    <span className="field-hint">Optional</span>
                  </div>
                  <DatePicker
                    id="lastWorkingDay"
                    value={form.watch('lastWorkingDay') || ''}
                    onChange={val => form.setValue('lastWorkingDay', val, { shouldValidate: true, shouldDirty: true })}
                    placeholder="Select last working day"
                  />
                </div>

                <div className="form-field">
                  <div className="field-label-row">
                    <label htmlFor="status">Lifecycle status</label>
                  </div>
                  <AnimatedSelect
                    id="status"
                    variant="form"
                    value={form.watch('status') || 'Onboarding'}
                    onChange={val => form.setValue('status', val as LifecycleStatus, { shouldValidate: true, shouldDirty: true })}
                    options={[
                      { value: 'Onboarding', label: 'Onboarding', subtext: 'Beginning onboarding journey' },
                      { value: 'Active', label: 'Active', subtext: 'Fully active team member' },
                      { value: 'Offboarding', label: 'Offboarding', subtext: 'Planned transition or exit' },
                      { value: 'Exited', label: 'Exited', subtext: 'Former employee' },
                    ]}
                  />
                </div>
              </div>

              {Object.keys(form.formState.errors).length > 0 && (
                <p className="field-error" role="alert">Please verify the required fields and email formatting.</p>
              )}

              <div className="form-actions">
                <button
                  type="submit"
                  className="primary-action"
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Saving employee…
                    </>
                  ) : (
                    <>
                      <Check size={16} /> Save employee
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => { form.reset(); setCreatedEmployee(null); }}
                  disabled={createMutation.isPending}
                >
                  Clear fields
                </button>
              </div>
            </form>
          </Form>

          {createdEmployee && (
            <div className="preview-result" role="status" style={{ borderLeftColor: '#2ba45a' }}>
              <b style={{ color: '#166534' }}>✓ Employee Added Successfully</b>
              <p>{createdEmployee.name} has been successfully added to your workspace.</p>
            </div>
          )}
        </section>
        <aside className="panel form-aside">
          <span className="aside-icon"><UserCheck size={19} /></span>
          <h2>Instant Onboarding</h2>
          <p>New team members are immediately enrolled in your workspace journey checklist and lifecycle touchpoints.</p>
          <span className="aside-note">Lifecycle & touchpoints tracked automatically</span>
        </aside>
      </div>
    </>
  );
}

const offboardingFormSchema = z.object({
  employeeId: z.string().min(1, 'Select an employee.'),
  lastWorkingDay: z.string().min(1, 'Select planned last working day.'),
  contactEmail: z.union([z.string().email(), z.literal('')]),
  note: z.string(),
});
type OffboardingFormValues = z.infer<typeof offboardingFormSchema>;

function ScheduleOffboarding() {
  const [scheduledExit, setScheduledExit] = useState<{ name: string; date: string } | null>(null);
  const { data: employeesData } = useEmployees({ limit: 100 });
  const offboardMutation = useOffboardEmployee();
  const { toast } = useToast();

  const candidateEmployees: ApiEmployee[] = employeesData?.data
    ? employeesData.data.filter(e => e.status !== 'Exited')
    : [];

  const form = useForm<OffboardingFormValues>({
    resolver: zodResolver(offboardingFormSchema),
    defaultValues: { employeeId: '', lastWorkingDay: '', contactEmail: '', note: '' },
  });

  const onSubmit = async (values: OffboardingFormValues) => {
    try {
      const selectedPerson = candidateEmployees.find(p => String(p.employeeId) === values.employeeId);

      const result = await offboardMutation.mutateAsync({
        employeeId: values.employeeId,
        payload: {
          plannedExitDate: values.lastWorkingDay,
          lastWorkingDay: values.lastWorkingDay,
          contactEmail: values.contactEmail || undefined,
          notes: values.note,
        },
      });

      toast({
        title: 'Offboarding Scheduled',
        description: `Lifecycle transition for ${result.employee.name} recorded successfully.`,
      });

      setScheduledExit({
        name: result.employee.name,
        date: values.lastWorkingDay,
      });
      form.reset();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Offboarding Failed',
        description: (err as Error).message || 'Failed to record offboarding.',
      });
    }
  };

  return (
    <>
      <PageHeading
        eyebrow="Lifecycle Management"
        title="Record an exit"
        text="Schedule offboarding and manage transition milestones."
      />
      <div className="form-preview-layout">
        <section className="panel form-panel">
          <Form {...form}>
            <form autoComplete="off" onSubmit={form.handleSubmit(onSubmit)}>
              <div className="form-grid">
                <div className="form-field">
                  <div className="field-label-row">
                    <label htmlFor="exitEmployeeId">Employee</label>
                  </div>
                  <AnimatedSelect
                    id="exitEmployeeId"
                    variant="form"
                    placeholder="Select team member"
                    value={form.watch('employeeId') || ''}
                    onChange={val => form.setValue('employeeId', val, { shouldValidate: true, shouldDirty: true })}
                    options={candidateEmployees.map(person => ({
                      value: String(person.employeeId),
                      label: person.name,
                      subtext: `${person.departmentName || 'General'} · ${person.status}`,
                    }))}
                  />
                </div>

                <div className="form-field">
                  <div className="field-label-row">
                    <label htmlFor="exitLastWorkingDay">Last working day</label>
                  </div>
                  <DatePicker
                    id="exitLastWorkingDay"
                    value={form.watch('lastWorkingDay')}
                    onChange={val => form.setValue('lastWorkingDay', val, { shouldValidate: true, shouldDirty: true })}
                    placeholder="Select planned exit date"
                    required
                  />
                </div>

                <div className="form-field">
                  <div className="field-label-row">
                    <label htmlFor="contactEmail">Contact email</label>
                    <span className="field-hint">Optional</span>
                  </div>
                  <input id="contactEmail" {...form.register('contactEmail')} type="email" placeholder="personal@example.com" />
                </div>

                <div className="form-field">
                  <div className="field-label-row">
                    <label htmlFor="note">Transition notes</label>
                    <span className="field-hint">Optional</span>
                  </div>
                  <input id="note" {...form.register('note')} placeholder="Handover, equipment return notes" />
                </div>
              </div>

              {Object.keys(form.formState.errors).length > 0 && (
                <p className="field-error" role="alert">Choose an employee, planned date, and valid email.</p>
              )}

              <div className="form-actions">
                <button
                  type="submit"
                  className="primary-action"
                  disabled={offboardMutation.isPending}
                >
                  {offboardMutation.isPending ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Recording offboarding…
                    </>
                  ) : (
                    <>
                      <Check size={16} /> Record offboarding
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => { form.reset(); setScheduledExit(null); }}
                  disabled={offboardMutation.isPending}
                >
                  Clear fields
                </button>
              </div>
            </form>
          </Form>

          {scheduledExit && (
            <div className="preview-result" role="status" style={{ borderLeftColor: '#2ba45a' }}>
              <b style={{ color: '#166534' }}>✓ Offboarding Scheduled</b>
              <p>{scheduledExit.name} has been transitioned to Offboarding with planned exit on {fmt(scheduledExit.date)}.</p>
            </div>
          )}
        </section>
        <aside className="panel form-aside">
          <span className="aside-icon"><ClipboardCheck size={19} /></span>
          <h2>Smooth Transitions</h2>
          <p>Scheduling an exit automatically coordinates checklist milestones, asset handovers, and transition communications.</p>
          <span className="aside-note">Lifecycle stage updated to Offboarding</span>
        </aside>
      </div>
    </>
  );
}

function TemplatesPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const templates = [
    { title: 'A warm welcome', type: 'Onboarding · day one', body: 'We are glad you are here. Here is a gentle guide to your first day and the people who can help.' },
    { title: 'First-week check-in', type: 'Onboarding · week one', body: 'How has your first week felt? Share what is clear and what would make settling in easier.' },
    { title: 'A thoughtful farewell', type: 'Offboarding · transition', body: 'Thank you for the care you have brought to this chapter. Here are the practical details for your next steps.' },
  ];
  return <><PageHeading eyebrow="Communication · examples" title="Email Templates" text="Touchpoint templates for employee milestones." /><div className="template-grid">{templates.map((template, index) => <article className="panel template-card" key={template.title}><span className={`template-icon tone-${index}`}><FileText size={19} /></span><span className="panel-kicker">{template.type}</span><h2>{template.title}</h2><p>{template.body}</p><button className="secondary-action" onClick={() => setSelected(selected === template.title ? null : template.title)}>{selected === template.title ? 'Close preview' : 'Preview copy'}</button>{selected === template.title && <div className="template-preview" role="status"><b>Copy preview</b><p>{template.body}</p><small>Linked to notification dispatch worker.</small></div>}</article>)}</div></>;
}

function ResponsesPage() {
  const { exitInterviews } = useWorkspaceLifecycleData();
  const submitted = exitInterviews.filter(item => item.status === 'Submitted');
  return (
    <>
      <PageHeading eyebrow="Exit Management" title="Interview Responses" text="Submission tracking and feedback from offboarded personnel." />
      <div className="response-summary">
        <span className="kpi-icon lilac"><ClipboardCheck size={19} /></span>
        <div>
          <b>{submitted.length} submitted exit interview{submitted.length === 1 ? '' : 's'}</b>
          <p>Structured interview records linked to workspace team accounts.</p>
        </div>
      </div>
      <ExitTable rows={submitted} />
    </>
  );
}

function SettingsPage() {
  const { appUser, user, signOut } = useAuth();
  const [dateFormat, setDateFormat] = useState('DD MMM YYYY');
  const [landingView, setLandingView] = useState('overview');
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [journeyDigests, setJourneyDigests] = useState(true);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const { toast } = useToast();

  const displayName = appUser?.displayName || user?.displayName || user?.email?.split('@')[0] || 'Workspace User';
  const avatarLetter = (displayName[0] || 'U').toUpperCase();

  const handleSavePreferences = () => {
    toast({
      title: 'Preferences Saved',
      description: 'Your workspace settings have been updated successfully.',
    });
  };

  return (
    <>
      <PageHeading
        eyebrow="Preferences & Account"
        title="Workspace Settings"
        text="Customize your personal experience, notification alerts, and workspace display preferences."
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(280px, 0.8fr)', gap: '16px', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Account Profile Card */}
          <section className="panel" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
              <div
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  width: '52px',
                  height: '52px',
                  borderRadius: '16px',
                  background: 'linear-gradient(135deg, #f8e5eb, #f5dcc4)',
                  color: '#8b4b62',
                  fontSize: '20px',
                  fontWeight: 700,
                  boxShadow: '0 4px 12px rgba(139, 75, 98, 0.12)',
                }}
              >
                {avatarLetter}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#3d2e37' }}>
                    {displayName}
                  </h2>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: '999px',
                      background: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      color: '#166534',
                      fontSize: '10px',
                      fontWeight: 700,
                      letterSpacing: '.04em',
                    }}
                  >
                    Active Workspace
                  </span>
                </div>
                <p style={{ margin: '4px 0 0', color: '#887783', fontSize: '12px' }}>
                  {user?.email}
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', paddingTop: '16px', borderTop: '1px solid #f2e7e7' }}>
              <div>
                <span style={{ fontSize: '10px', color: '#9c8c96', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>
                  Account Type
                </span>
                <p style={{ margin: '4px 0 0', fontSize: '13px', fontWeight: 600, color: '#44353f' }}>
                  Personal Workspace
                </p>
              </div>
              <div>
                <span style={{ fontSize: '10px', color: '#9c8c96', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>
                  Workspace Privacy
                </span>
                <p style={{ margin: '4px 0 0', fontSize: '13px', fontWeight: 600, color: '#166534' }}>
                  Private & Isolated
                </p>
              </div>
            </div>
          </section>

          {/* Company & HR Profile Section */}
          <CompanyProfileCard />

          {/* Preferences Form */}
          <section className="panel" style={{ padding: '24px' }}>
            <div className="panel-heading" style={{ marginBottom: '18px' }}>
              <div>
                <span className="panel-kicker">DISPLAY & LOCALIZATION</span>
                <h2>Workspace Preferences</h2>
                <p>Choose your regional format and default landing destination.</p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '20px' }}>
              <div style={{ display: 'grid', gap: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#55444e' }}>Date Format</span>
                <AnimatedSelect
                  variant="form"
                  value={dateFormat}
                  onChange={setDateFormat}
                  options={[
                    { value: 'DD MMM YYYY', label: '24 Oct 2026', subtext: 'Day Month Year' },
                    { value: 'YYYY-MM-DD', label: '2026-10-24', subtext: 'ISO standard' },
                    { value: 'MM/DD/YYYY', label: '10/24/2026', subtext: 'US standard' },
                  ]}
                />
              </div>

              <div style={{ display: 'grid', gap: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#55444e' }}>Default View</span>
                <AnimatedSelect
                  variant="form"
                  value={landingView}
                  onChange={setLandingView}
                  options={[
                    { value: 'overview', label: 'People Overview', subtext: 'Metrics and summaries' },
                    { value: 'employees', label: 'Team Directory', subtext: 'All employees list' },
                    { value: 'onboarding', label: 'Onboarding Journeys', subtext: 'Active new joiners' },
                  ]}
                />
              </div>
            </div>

            <div className="panel-heading" style={{ margin: '24px 0 14px 0', paddingTop: '16px', borderTop: '1px solid #f4ecec' }}>
              <div>
                <span className="panel-kicker">COMMUNICATIONS</span>
                <h2>Notification Preferences</h2>
                <p>Manage event touchpoints and journey updates.</p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  background: '#fffdfa',
                  border: '1px solid #eee4e4',
                  cursor: 'pointer',
                }}
              >
                <div>
                  <b style={{ display: 'block', fontSize: '12px', color: '#44353f' }}>Milestone Email Reminders</b>
                  <span style={{ fontSize: '10px', color: '#8d7d87' }}>Receive notifications when employees reach key lifecycle dates</span>
                </div>
                <input
                  type="checkbox"
                  checked={emailAlerts}
                  onChange={e => setEmailAlerts(e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: '#bd7b92', cursor: 'pointer' }}
                />
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  background: '#fffdfa',
                  border: '1px solid #eee4e4',
                  cursor: 'pointer',
                }}
              >
                <div>
                  <b style={{ display: 'block', fontSize: '12px', color: '#44353f' }}>Weekly Journey Summary</b>
                  <span style={{ fontSize: '10px', color: '#8d7d87' }}>Receive an aggregated digest of upcoming onboarding and exit milestones</span>
                </div>
                <input
                  type="checkbox"
                  checked={journeyDigests}
                  onChange={e => setJourneyDigests(e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: '#bd7b92', cursor: 'pointer' }}
                />
              </label>
            </div>

            <div style={{ marginTop: '22px', display: 'flex', gap: '10px' }}>
              <button type="button" className="primary-action" onClick={handleSavePreferences}>
                <Check size={16} /> Save preferences
              </button>
            </div>
          </section>
        </div>

        {/* Aside: Privacy & Security */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Data Privacy & Compliance */}
          <section className="panel" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <span className="aside-icon" style={{ margin: 0 }}><UserCheck size={18} /></span>
              <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' }}>
                GDPR & CCPA Ready
              </span>
            </div>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#4a3b45', margin: '0 0 6px 0' }}>Data Privacy Guarantee</h2>
            <p style={{ fontSize: '11px', color: '#887680', lineHeight: 1.6, margin: '0 0 14px 0' }}>
              Your workspace is strictly isolated. All personnel files, onboarding roadmaps, and offboarding schedules created here are private to your Google account.
            </p>
            <button
              type="button"
              className="secondary-action"
              onClick={() => setShowPrivacyModal(true)}
              style={{ width: '100%', justifyContent: 'center', fontSize: '11px' }}
            >
              <FileText size={14} /> View Privacy & Compliance Policy
            </button>
          </section>

          {/* Security & Hacking Defenses */}
          <section className="panel" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <span className="aside-icon" style={{ margin: 0, color: '#0369a1', background: '#f0f9ff' }}><ShieldCheck size={18} /></span>
              <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                OWASP Hardened
              </span>
            </div>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#4a3b45', margin: '0 0 8px 0' }}>Threat Defense Status</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px', color: '#685963' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>SQL Injection:</span>
                <strong style={{ color: '#15803d' }}>Parameterized (100%)</strong>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>API Rate Limiter:</span>
                <strong style={{ color: '#15803d' }}>Active (500 req/15m)</strong>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Security Headers:</span>
                <strong style={{ color: '#15803d' }}>Helmet Active (CSP/HSTS)</strong>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Tamper Audit Log:</span>
                <strong style={{ color: '#15803d' }}>Enabled (hr_audit_logs)</strong>
              </div>
            </div>
          </section>

          {/* Session Management */}
          <section className="panel" style={{ padding: '20px' }}>
            <span className="aside-icon" style={{ marginBottom: '12px' }}><LogOut size={18} /></span>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#4a3b45', margin: '0 0 6px 0' }}>Session Management</h2>
            <p style={{ fontSize: '11px', color: '#887680', lineHeight: 1.6, margin: '0 0 14px 0' }}>
              Signed in with Google. You can safely sign out of your personal workspace at any time.
            </p>
            <button
              type="button"
              className="secondary-action"
              onClick={signOut}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              <LogOut size={14} /> Sign out
            </button>
          </section>
        </aside>
      </div>

      {/* Privacy & Compliance Policy Modal */}
      <AnimatePresence>
        {showPrivacyModal && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(56, 36, 47, 0.45)',
              backdropFilter: 'blur(4px)',
              padding: '20px',
            }}
            onClick={() => setShowPrivacyModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.2 }}
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: '680px',
                maxHeight: '85vh',
                display: 'flex',
                flexDirection: 'column',
                background: '#ffffff',
                borderRadius: '20px',
                boxShadow: '0 25px 50px -12px rgba(105, 52, 75, 0.25)',
                border: '1px solid #f0e3e7',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '20px 24px',
                  borderBottom: '1px solid #f4ecec',
                  background: '#fdfafb',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '10px',
                      background: '#fcecf2',
                      color: '#a85172',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <ShieldCheck size={20} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#3f2d38' }}>
                      Privacy & Data Protection Policy
                    </h3>
                    <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#917f8b' }}>
                      Compliance guarantees for People Journey personal workspace
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPrivacyModal(false)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: '#8b7c86',
                    padding: '6px',
                    borderRadius: '8px',
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '18px', fontSize: '13px', lineHeight: 1.6, color: '#554550' }}>
                <div>
                  <h4 style={{ margin: '0 0 6px 0', fontSize: '14px', fontWeight: 700, color: '#382631' }}>
                    1. Workspace Partitioning & Zero-Shared Access
                  </h4>
                  <p style={{ margin: 0 }}>
                    Every user has an exclusively partitioned workspace. All employee records, onboarding checklists, and offboarding logs are keyed directly to your unique, immutable identity. No other user of this platform has access to query, edit, or view your workspace contents.
                  </p>
                </div>

                <div>
                  <h4 style={{ margin: '0 0 6px 0', fontSize: '14px', fontWeight: 700, color: '#382631' }}>
                    2. Cryptographic Authentication & Token Claims
                  </h4>
                  <p style={{ margin: 0 }}>
                    Sign-in is verified directly through Google OAuth 2.0 PKCE. Credentials are never handled or stored by this application; the backend verifies short-lived cryptographically signed Firebase ID tokens on every API transaction.
                  </p>
                </div>

                <div>
                  <h4 style={{ margin: '0 0 6px 0', fontSize: '14px', fontWeight: 700, color: '#382631' }}>
                    3. OWASP Defensive Hardening
                  </h4>
                  <p style={{ margin: 0 }}>
                    The backend API employs parameterized SQL execution to eliminate SQL injection vectors, Helmet security headers (CSP, HSTS, X-Frame-Options) to neutralize clickjacking and XSS, and IP-level rate limiting to shield against distributed denial-of-service (DDoS) and brute-force attacks.
                  </p>
                </div>

                <div>
                  <h4 style={{ margin: '0 0 6px 0', fontSize: '14px', fontWeight: 700, color: '#382631' }}>
                    4. Immutable Forensic Audit Trail
                  </h4>
                  <p style={{ margin: 0 }}>
                    All sensitive workspace actions (employee additions, record edits, offboarding transitions, and authentication events) are captured in an append-only audit log table (<code style={{ background: '#f5eaef', padding: '2px 6px', borderRadius: '4px', fontSize: '12px' }}>hr_audit_logs</code>) with ISO timestamps and user IDs.
                  </p>
                </div>

                <div>
                  <h4 style={{ margin: '0 0 6px 0', fontSize: '14px', fontWeight: 700, color: '#382631' }}>
                    5. GDPR & CCPA Rights (Portability & Erasure)
                  </h4>
                  <p style={{ margin: 0 }}>
                    You retain 100% ownership of your personnel data. In compliance with GDPR and CCPA regulations, you have the right to export your team data, rectify inaccurate records, or request complete account erasure with cascading cleanup.
                  </p>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  padding: '16px 24px',
                  borderTop: '1px solid #f4ecec',
                  background: '#fdfafb',
                }}
              >
                <button
                  type="button"
                  className="primary-action"
                  onClick={() => setShowPrivacyModal(false)}
                >
                  <Check size={16} /> Acknowledge and Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}




function PersonalDashboard() {
  const { data: dashboard, isLoading, error, refetch } = usePersonalDashboard();
  const { user } = useAuth();

  if (isLoading) {
    return (
      <div className="panel" style={{ padding: '60px 20px', textAlign: 'center', color: '#887582' }}>
        <Loader2 size={28} className="animate-spin" style={{ margin: '0 auto 12px auto', color: '#bd7b92' }} />
        <h3>Loading your personal workspace...</h3>
        <p>Preparing your personal team touchpoints</p>
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="panel" style={{ padding: '40px 20px', textAlign: 'center' }}>
        <CircleHelp size={32} style={{ margin: '0 auto 12px auto', color: '#e11d48' }} />
        <h3>Unable to load your dashboard</h3>
        <p style={{ color: '#6b7280', margin: '8px 0 16px 0' }}>
          {(error as Error)?.message || 'Workspace service temporarily unavailable. Please retry.'}
        </p>
        <button type="button" className="primary-action" onClick={() => refetch()} style={{ margin: '0 auto' }}>
          Retry
        </button>
      </div>
    );
  }

  const { user: profile, employeeProfile, checklist, notifications } = dashboard;
  const completedCount = checklist.filter(c => c.completed).length;
  const totalCount = checklist.length;

  const stats = [
    {
      label: 'Account status',
      value: (profile.accountStatus || 'active').toUpperCase(),
      icon: UserCheck,
      tone: 'rose',
      note: 'Verified Google identity',
    },
    {
      label: 'Access role',
      value: profile.role === 'user' ? 'Standard User' : profile.role,
      icon: BriefcaseBusiness,
      tone: 'lilac',
      note: 'Private workspace active',
    },
    {
      label: 'Corporate profile',
      value: employeeProfile ? employeeProfile.employeeCode : 'Not linked',
      icon: UsersRound,
      tone: 'peach',
      note: employeeProfile ? (employeeProfile.departmentName || 'Corporate Member') : 'Pending HR Directory match',
    },
    {
      label: 'Journey checklist',
      value: `${completedCount} of ${totalCount}`,
      icon: ClipboardCheck,
      tone: 'butter',
      note: `${Math.round((completedCount / (totalCount || 1)) * 100)}% touchpoints ready`,
    },
  ];

  return (
    <>
      <PageHeading
        eyebrow="Personal Workspace"
        title={`Welcome, ${profile.displayName || user?.displayName || 'Team Member'}`}
        text="Your personalized employee lifecycle, onboarding touchpoints, and notifications."
      />

      <section className="kpi-grid" aria-label="Personal overview">
        {stats.map(item => {
          const Icon = item.icon;
          return (
            <div className="kpi-card" key={item.label}>
              <span className={`kpi-icon ${item.tone}`}><Icon size={19} /></span>
              <span className="kpi-label">{item.label}</span>
              <b className="kpi-value">{item.value}</b>
              <small>{item.note}</small>
            </div>
          );
        })}
      </section>

      <div className="overview-grid">
        {/* Left Column: Corporate Record & Journey Checklist */}
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">EMPLOYEE RECORD</span>
              <h2>Corporate Profile</h2>
              <p>Your official corporate employee record and department.</p>
            </div>
            <UsersRound size={18} className="heading-icon" />
          </div>

          {employeeProfile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                <div style={{ padding: '10px', background: '#fdfbfa', borderRadius: '8px', border: '1px solid #ebdada' }}>
                  <small style={{ color: '#887582', fontSize: '11px' }}>Employee Code</small>
                  <p style={{ fontWeight: 600, color: '#33242c', margin: '2px 0 0 0' }}>{employeeProfile.employeeCode}</p>
                </div>
                <div style={{ padding: '10px', background: '#fdfbfa', borderRadius: '8px', border: '1px solid #ebdada' }}>
                  <small style={{ color: '#887582', fontSize: '11px' }}>Department</small>
                  <p style={{ fontWeight: 600, color: '#33242c', margin: '2px 0 0 0' }}>{employeeProfile.departmentName || 'General'}</p>
                </div>
                <div style={{ padding: '10px', background: '#fdfbfa', borderRadius: '8px', border: '1px solid #ebdada' }}>
                  <small style={{ color: '#887582', fontSize: '11px' }}>Designation</small>
                  <p style={{ fontWeight: 600, color: '#33242c', margin: '2px 0 0 0' }}>{employeeProfile.designationName || 'Team Member'}</p>
                </div>
                <div style={{ padding: '10px', background: '#fdfbfa', borderRadius: '8px', border: '1px solid #ebdada' }}>
                  <small style={{ color: '#887582', fontSize: '11px' }}>Joining Date</small>
                  <p style={{ fontWeight: 600, color: '#33242c', margin: '2px 0 0 0' }}>{fmt(employeeProfile.hireDate)}</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0', color: '#166534', fontSize: '12px' }}>
                <Check size={16} />
                <span>Your Google identity is securely linked to your personal workspace ({profile.email}).</span>
              </div>
            </div>
          ) : (
            <div style={{ padding: '16px', background: '#fdf4f7', borderRadius: '12px', border: '1px solid #fae2eb', color: '#7b3e55', marginTop: '12px' }}>
              <b style={{ display: 'block', marginBottom: '4px' }}>Welcome to Your Personal Workspace</b>
              <p style={{ fontSize: '12px', margin: 0, lineHeight: 1.5 }}>
                You are signed in as <b>{profile.email}</b>. You have full access to manage your own team directory, track onboarding, schedule transitions, and customize touchpoints in your private workspace.
              </p>
            </div>
          )}

          <div style={{ marginTop: '24px' }}>
            <div className="panel-heading" style={{ marginBottom: '12px' }}>
              <div>
                <span className="panel-kicker">ONBOARDING TOUCHPOINTS</span>
                <h2>Your Journey Checklist</h2>
              </div>
            </div>
            <div className="event-list">
              {checklist.map(item => (
                <article className="event-item" key={item.id} style={{ alignItems: 'center' }}>
                  <span
                    className="event-node"
                    style={{
                      background: item.completed ? '#16a34a' : '#9ca3af'
                    }}
                  />
                  <div className="event-copy">
                    <b style={{ color: '#2d222b' }}>{item.title}</b>
                    <span>{item.description}</span>
                  </div>
                  <span
                    className={`status-badge status-${item.completed ? 'active' : 'pending'}`}
                  >
                    {item.completed ? 'Done' : 'Pending'}
                  </span>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Right Column: Identity/Security & Personal Notifications */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="panel-kicker">ACCOUNT & ACCESS</span>
                <h2>Security & Profile</h2>
                <p>Your verified credentials and workspace status.</p>
              </div>
              <UserCheck size={18} className="heading-icon" />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f3e8e8' }}>
                <span style={{ color: '#7a6673' }}>Email</span>
                <span style={{ fontWeight: 600, color: '#31232c' }}>{profile.email}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f3e8e8' }}>
                <span style={{ color: '#7a6673' }}>Display Name</span>
                <span style={{ fontWeight: 600, color: '#31232c' }}>{profile.displayName || '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f3e8e8' }}>
                <span style={{ color: '#7a6673' }}>Workspace Role</span>
                <span style={{ fontWeight: 600, color: '#16a34a', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '.05em' }}>
                  Personal Workspace
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f3e8e8' }}>
                <span style={{ color: '#7a6673' }}>Workspace Privacy</span>
                <span style={{ fontWeight: 600, color: '#16a34a' }}>Strictly Isolated</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                <span style={{ color: '#7a6673' }}>Member Since</span>
                <span style={{ fontWeight: 600, color: '#31232c' }}>{fmt(profile.createdAt)}</span>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="panel-kicker">COMMUNICATIONS</span>
                <h2>Personal Notifications</h2>
                <p>Direct touchpoints sent to your account.</p>
              </div>
              <Bell size={18} className="heading-icon" />
            </div>

            <div className="event-list" style={{ marginTop: '12px' }}>
              {notifications.map(notif => (
                <article className="event-item" key={notif.id}>
                  <span className="event-node" />
                  <div className="event-copy">
                    <b>{notif.title}</b>
                    <span>{notif.message}</span>
                  </div>
                  <span style={{ fontSize: '11px', color: '#978691', whiteSpace: 'nowrap' }}>
                    {fmt(notif.createdAt)}
                  </span>
                </article>
              ))}
              {notifications.length === 0 && (
                <p className="empty-inline" style={{ padding: '20px 0', textAlign: 'center' }}>
                  No unread notifications at this time.
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

export function DashboardPage() {
  const [path, setPath] = useLocation();
  const [globalSearch, setGlobalSearch] = useState('');
  const title = titles[path] || 'Personal Workspace';

  const content = useMemo(() => {
    if (path === '/dashboard') {
      return <Overview />;
    }
    return <ListingPage path={path} globalSearch={globalSearch} setGlobalSearch={setGlobalSearch} />;
  }, [path, globalSearch]);

  return <Shell title={title} path={path} onNavigate={setPath} searchValue={globalSearch} onSearchChange={setGlobalSearch}>{content}</Shell>;
}


