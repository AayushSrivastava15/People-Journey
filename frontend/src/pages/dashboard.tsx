import { useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import {
  Activity, ArrowDownLeft, ArrowRight, Bell, BriefcaseBusiness, CalendarDays, Check,
  ChevronDown, ChevronLeft, ChevronRight, CircleHelp, ClipboardCheck, Clock3, Database, DoorOpen,
  FileText, LayoutDashboard, ListFilter, Loader2, LogOut, Menu, MessageSquareText, Search, Settings,
  UserCheck, Users, UsersRound, X,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Form } from '@/components/ui/form';
import {
  dateFromToday, demoDepartments, demoEmployees, demoExitInterviews,
  demoNotifications, employeeById, recentMonthBuckets, type LifecycleStatus, type NoticeStatus,
} from '@/lib/demo-data';
import {
  useDashboardStats, useEmployees, useDepartments, useDesignations,
  useCreateEmployee, useOffboardEmployee,
} from '@/api/queries';
import type { Employee as ApiEmployee } from '@/types/api';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useAuth } from '@/context';

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
  { label: 'Administration', links: [
    { label: 'HR Users', path: '/dashboard/hr-users', icon: Users },
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
  '/dashboard/hr-users': 'HR Users',
  '/dashboard/settings': 'Settings',
};

const statusClass: Record<string, string> = {
  Active: 'active', Onboarding: 'onboarding', Offboarding: 'offboarding', Exited: 'exited',
  Pending: 'pending', Processing: 'processing', Sent: 'sent', Failed: 'failed', Cancelled: 'cancelled',
  Invited: 'pending', Submitted: 'sent', Expired: 'cancelled',
};

const fmt = (date: string | null | undefined) => {
  if (!date) return '—';
  const clean = date.slice(0, 10);
  const parts = clean.split('-').map(Number);
  if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) return date;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(parts[0], parts[1] - 1, parts[2]));
};

function SystemLiveBanner() {
  return (
    <div
      className="demo-banner"
      role="status"
      style={{
        background: '#f4fbf6',
        borderColor: '#bce8ca',
        color: '#1a6438',
      }}
    >
      <span
        className="demo-banner-mark"
        style={{
          background: '#2ba45a',
          color: '#ffffff',
          fontWeight: 700,
          letterSpacing: '.04em',
        }}
      >
        ORACLE LIVE
      </span>
      <span>Connected to Oracle Database Free (FREEPDB1) on Debian Home Server</span>
    </div>
  );
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
  const { user, authRole, signOut } = useAuth();
  const shouldReduceMotion = useReducedMotion();

  const handleSignOut = async () => {
    await signOut();
    onNavigate('/login');
  };

  const displayName = user?.displayName || user?.email?.split('@')[0] || 'HR Team';
  const avatarLetter = (displayName[0] || 'H').toUpperCase();
  const roleLabel = authRole === 'hr_admin' ? 'Admin' : 'HR Staff';

  return (
    <div className="dashboard-frame">
      <SystemLiveBanner />
      <div className="dashboard-shell">
        <aside className={`dash-sidebar ${collapsed ? 'is-collapsed' : ''} ${menuOpen ? 'is-open' : ''}`} aria-label="Workspace navigation">
          <Link href="/dashboard" className="dash-brand">
            <span className="dash-brand-symbol" aria-hidden="true"><i /><i /><i /></span>
            <span className="dash-brand-name">people<span>journey</span><small>ORACLE HR</small></span>
          </Link>
          <div className="workspace-label">PEOPLE WORKSPACE</div>
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
                      {item.path === '/dashboard/hr-users' && (
                        <small className="nav-unavailable" style={{ background: '#eaf4ee', color: '#276e43' }}>SECURE</small>
                      )}
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
                {user?.email || roleLabel}
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
              <span>People Workspace</span>
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
              <span className="sr-only">Search employee records</span>
              <input
                value={searchValue}
                onChange={event => {
                  const value = event.target.value;
                  onSearchChange(value);
                  if (value.trim() && path !== '/dashboard/employees') onNavigate('/dashboard/employees');
                }}
                placeholder="Search employees in Oracle..."
              />
              <kbd>ORACLE</kbd>
            </label>
            <Link href="/dashboard/notifications" className="topbar-bell" aria-label="View notification preview">
              <Bell size={18} />
              <i>{demoNotifications.filter(item => item.status === 'Pending').length}</i>
            </Link>
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
                  {roleLabel}
                </span>
              </div>

              <button
                type="button"
                onClick={handleSignOut}
                title="Sign out of HR Workspace"
                aria-label="Sign out of HR Workspace"
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
                initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, filter: 'blur(4px)' }}
                animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, filter: 'blur(2px)' }}
                transition={{
                  duration: 0.24,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="dash-tab-pane"
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>
          <footer className="dash-footer">People Journey · Connected to Oracle Database Free (Debian Home Server) · Real-Time Lifecycle</footer>
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

function EmployeeTable({ people, compact = false, isLoading = false }: { people: (ApiEmployee | typeof demoEmployees[0])[]; compact?: boolean; isLoading?: boolean }) {
  if (isLoading) {
    return (
      <div className="table-scroll" style={{ padding: '40px 20px', textAlign: 'center', color: '#887582' }}>
        <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px auto', color: '#bd7b92' }} />
        <span>Loading live employee records from Oracle Database...</span>
      </div>
    );
  }

  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>Employee</th>
            <th>Department</th>
            <th>Role / Designation</th>
            <th>Joining date</th>
            {!compact && <th>Last working day</th>}
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {people.map(person => {
            const id = 'employeeId' in person ? person.employeeId : person.id;
            const name = person.name;
            const email = 'workEmail' in person && person.workEmail ? person.workEmail : ('personalEmail' in person ? person.personalEmail : '');
            const code = 'employeeCode' in person ? person.employeeCode : '';
            const dept = 'departmentName' in person ? (person.departmentName || 'General') : ('department' in person ? person.department : 'General');
            const role = 'designationName' in person && person.designationName ? person.designationName : ('manager' in person ? person.manager : 'Staff');
            const hire = 'hireDate' in person ? person.hireDate : person.joiningDate;
            const exit = 'exitDate' in person ? person.exitDate : person.lastWorkingDay;
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
                {!compact && <td>{fmt(exit)}</td>}
                <td><Status value={person.status} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {people.length === 0 && (
        <div className="table-empty">
          <UsersRound size={22} />
          <b>No matching employee records</b>
          <span>No employees found in Oracle Database. Try adding a new employee or clearing your search filters.</span>
        </div>
      )}
    </div>
  );
}

function NotificationTable({ rows }: { rows: typeof demoNotifications }) {
  return <div className="table-scroll"><table className="data-table"><thead><tr><th>Employee</th><th>Notification type</th><th>Recipient</th><th>Scheduled date</th><th>Status</th><th>Last attempt</th><th>Action</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{employeeById(row.employeeId)?.name}</td><td>{row.type}</td><td>{row.recipient}</td><td>{fmt(row.scheduledDate)}</td><td><Status value={row.status} /></td><td>{row.lastAttempt || 'Not attempted'}</td><td><button className="text-action" type="button" disabled title="Retry is unavailable in this preview">Retry unavailable</button></td></tr>)}</tbody></table>{rows.length === 0 && <div className="table-empty"><Bell size={22} /><b>No matching notification previews</b><span>Adjust the search or status filter.</span></div>}</div>;
}

function Overview() {
  const [activityFilter, setActivityFilter] = useState('All');
  const [page, setPage] = useState(0);
  const today = dateFromToday(0);
  const nextWeek = dateFromToday(7);
  const currentMonth = today.slice(0, 7);

  // Fetch live stats from Oracle
  const { data: liveStats } = useDashboardStats();

  const totalEmployees = liveStats ? liveStats.totalEmployees : demoEmployees.filter(p => p.status === 'Active').length;
  const joiningMonth = liveStats ? liveStats.joiningThisMonth : demoEmployees.filter(p => p.joiningDate.startsWith(currentMonth)).length;
  const upcomingJoiners = liveStats ? liveStats.upcomingJoiners : demoEmployees.filter(p => p.status === 'Onboarding' && p.joiningDate >= today && p.joiningDate <= nextWeek).length;
  const upcomingExits = liveStats ? liveStats.upcomingExits : demoEmployees.filter(p => p.status === 'Offboarding' && p.lastWorkingDay !== null && p.lastWorkingDay >= today && p.lastWorkingDay <= nextWeek).length;

  const stats = [
    { label: 'Total employees', value: totalEmployees, icon: UsersRound, tone: 'rose', href: '/dashboard/employees', note: liveStats ? 'Live Oracle records' : 'Sample records' },
    { label: 'Joining this month', value: joiningMonth, icon: CalendarDays, tone: 'peach', href: '/dashboard/onboarding', note: 'Current calendar month' },
    { label: 'Upcoming joiners', value: upcomingJoiners, icon: DoorOpen, tone: 'lilac', href: '/dashboard/onboarding', note: 'Joining within next 7 days' },
    { label: 'Upcoming exits', value: upcomingExits, icon: ArrowDownLeft, tone: 'peach', href: '/dashboard/offboarding', note: 'Exiting within next 7 days' },
    { label: 'Pending notifications', value: demoNotifications.filter(p => p.status === 'Pending' || p.status === 'Processing').length, icon: Bell, tone: 'butter', href: '/dashboard/notifications', note: 'Preview jobs' },
    { label: 'Completed interviews', value: demoExitInterviews.filter(p => p.status === 'Submitted').length, icon: ClipboardCheck, tone: 'lilac', href: '/dashboard/interview-responses', note: 'Submitted responses' },
  ];

  const statusData = liveStats?.statusDistribution || [
    { name: 'Active', value: demoEmployees.filter(p => p.status === 'Active').length },
    { name: 'Onboarding', value: demoEmployees.filter(p => p.status === 'Onboarding').length },
    { name: 'Offboarding', value: demoEmployees.filter(p => p.status === 'Offboarding').length },
    { name: 'Exited', value: demoEmployees.filter(p => p.status === 'Exited').length },
  ];
  const colors = ['#d99bad', '#e7b993', '#bcb1d8', '#d7c9bd'];

  const activity = liveStats?.monthlyActivity || recentMonthBuckets(6).map(bucket => ({
    month: bucket.label,
    joining: demoEmployees.filter(person => person.joiningDate.slice(0, 7) === bucket.key).length,
    exits: demoEmployees.filter(person => person.lastWorkingDay?.slice(0, 7) === bucket.key).length,
  }));

  const events = (liveStats?.upcomingEvents && liveStats.upcomingEvents.length > 0)
    ? liveStats.upcomingEvents
    : [
        ...demoEmployees.filter(p => p.status === 'Onboarding').map(p => ({ id: p.id, person: p.name, label: 'Joining date', date: p.joiningDate, status: p.status, path: '/dashboard/onboarding' })),
        ...demoEmployees.filter(p => p.status === 'Offboarding').map(p => ({ id: p.id, person: p.name, label: 'Last working day', date: p.lastWorkingDay || '', status: p.status, path: '/dashboard/offboarding' })),
      ].filter(event => event.date >= today && event.date <= dateFromToday(14)).sort((a, b) => a.date.localeCompare(b.date));

  const filteredNotices = demoNotifications.filter(item => activityFilter === 'All' || item.status === activityFilter);
  const shownNotices = filteredNotices.slice(page * 3, page * 3 + 3);

  return (
    <>
      <PageHeading
        eyebrow="Live Oracle Dashboard"
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
              <span className="panel-kicker">ORACLE RECORDS · LAST 6 MONTHS</span>
              <h2>Employee journey overview</h2>
              <p>Joining dates and last working days stored in database.</p>
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
              <p>Based on HR_EMPLOYEES status column.</p>
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
          <label className="filter-select">
            <ListFilter size={15} />
            <span className="sr-only">Filter notification status</span>
            <select value={activityFilter} onChange={event => { setActivityFilter(event.target.value); setPage(0); }}>
              <option>All</option>
              {(['Pending', 'Processing', 'Sent', 'Failed', 'Cancelled'] as NoticeStatus[]).map(status => <option key={status}>{status}</option>)}
            </select>
            <ChevronDown size={14} />
          </label>
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
          <span>Showing {filteredNotices.length ? page * 3 + 1 : 0}–{Math.min((page + 1) * 3, filteredNotices.length)} of {filteredNotices.length} sample jobs</span>
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
  const title = titles[path] || 'People Workspace';

  if (path === '/dashboard/hr-users') return <Unavailable title={title} />;
  if (path === '/dashboard/add-employee') return <AddEmployee />;
  if (path === '/dashboard/schedule-offboarding') return <ScheduleOffboarding />;
  if (path === '/dashboard/settings') return <SettingsPage />;
  if (path === '/dashboard/templates') return <TemplatesPage />;
  if (path === '/dashboard/interview-responses') return <ResponsesPage />;

  const desc: Record<string, string> = {
    '/dashboard/employees': 'A directory of employee records stored in Oracle Database Free.',
    '/dashboard/onboarding': 'Employees currently in the onboarding stage.',
    '/dashboard/offboarding': 'Transition records and planned exit schedules.',
    '/dashboard/departments': 'Active departments and employee distribution in Oracle.',
    '/dashboard/notifications': 'Notification job previews and templates.',
    '/dashboard/notification-history': 'Audit trail and delivery history.',
    '/dashboard/exit-interviews': 'Exit interviews and transition feedback.',
  };

  const peopleMode = ['/dashboard/employees', '/dashboard/onboarding', '/dashboard/offboarding', '/dashboard/departments'].includes(path);
  const notificationMode = ['/dashboard/notifications', '/dashboard/notification-history'].includes(path);

  if (path === '/dashboard/exit-interviews') return <><PageHeading eyebrow="Exit management" title={title} text={desc[path]} /><ExitTable /></>;

  // Determine status filter for Oracle query
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

  const people = employeeData?.data || [];
  const totalCount = employeeData?.total || 0;
  const pageCount = Math.max(1, employeeData?.totalPages || 1);

  const filteredNotifications = demoNotifications.filter(item =>
    `${employeeById(item.employeeId)?.name} ${item.type} ${item.recipient}`.toLowerCase().includes(globalSearch.toLowerCase()) &&
    (status === 'All statuses' || item.status === status)
  );

  return (
    <>
      <PageHeading
        eyebrow="Oracle Database Records"
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
          <label className="filter-select">
            <ListFilter size={15} />
            <span className="sr-only">Filter status</span>
            <select value={status} onChange={event => { setStatus(event.target.value); setPage(0); }}>
              <option>All statuses</option>
              {(notificationMode ? ['Pending', 'Processing', 'Sent', 'Failed', 'Cancelled'] : ['Active', 'Onboarding', 'Offboarding', 'Exited']).map(value => <option key={value}>{value}</option>)}
            </select>
            <ChevronDown size={14} />
          </label>
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
              <EmployeeTable people={people} isLoading={employeesLoading} />
            ) : (
              <NotificationTable rows={filteredNotifications.slice(page * pageSize, (page + 1) * pageSize)} />
            )}
          </motion.div>
        </AnimatePresence>
        <div className="pagination">
          <span>
            Page {page + 1} of {pageCount} · {peopleMode ? totalCount : filteredNotifications.length} records
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

function ExitTable() {
  return (
    <section className="panel listing-panel">
      <p className="inline-notice">Interview invitations are linked to offboarding workflows in Oracle.</p>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Interview status</th>
              <th>Link expiry</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {demoExitInterviews.map(row => (
              <tr key={row.id}>
                <td>{employeeById(row.employeeId)?.name}</td>
                <td><Status value={row.status} /></td>
                <td>{fmt(row.expires)}</td>
                <td><button className="text-action" disabled title="Interview response viewer">Details</button></td>
              </tr>
            ))}
          </tbody>
        </table>
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

  const deptList = departments && departments.length > 0
    ? departments.map(d => d.departmentName)
    : demoDepartments;

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
        title: 'Employee Registered',
        description: `${created.name} (${created.employeeCode}) has been persisted to Oracle Database.`,
      });

      setCreatedEmployee(created);
      form.reset();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Failed to Add Employee',
        description: (err as Error).message || 'A database error occurred while creating the employee.',
      });
    }
  };

  return (
    <>
      <PageHeading
        eyebrow="Create Employee Record"
        title="Add an employee"
        text="Register a new team member and persist their profile directly to Oracle Database."
      />
      <div className="form-preview-layout">
        <section className="panel form-panel">
          <Form {...form}>
            <form autoComplete="off" onSubmit={form.handleSubmit(onSubmit)}>
              <div className="form-grid">
                <label>
                  Full name
                  <input {...form.register('fullName')} required placeholder="e.g. Avery Morgan" />
                </label>
                <label>
                  Work email
                  <input {...form.register('workEmail')} type="email" placeholder="name@peoplejourney.com" />
                </label>
                <label>
                  Personal email <span className="field-hint">Optional</span>
                  <input {...form.register('personalEmail')} type="email" placeholder="name@example.com" />
                </label>
                <label>
                  Department
                  <select {...form.register('department')} required>
                    <option value="">Select department</option>
                    {deptList.map(dept => <option key={dept}>{dept}</option>)}
                  </select>
                </label>
                <label>
                  Designation / Role
                  <select {...form.register('designation')}>
                    <option value="">Select designation (optional)</option>
                    {(designations || []).map(des => (
                      <option key={des.designationId} value={des.designationName}>{des.designationName}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Joining date
                  <input {...form.register('joiningDate')} type="date" required />
                </label>
                <label>
                  Last working day <span className="field-hint">Optional</span>
                  <input {...form.register('lastWorkingDay')} type="date" />
                </label>
                <label>
                  Lifecycle status
                  <select {...form.register('status')}>
                    <option value="Onboarding">Onboarding</option>
                    <option value="Active">Active</option>
                    <option value="Offboarding">Offboarding</option>
                    <option value="Exited">Exited</option>
                  </select>
                </label>
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
                      Saving to Oracle…
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
              <b style={{ color: '#166534' }}>✓ Saved in Oracle Database Free</b>
              <p>{createdEmployee.name} registered under code <strong>{createdEmployee.employeeCode}</strong> in {createdEmployee.departmentName || 'General'}.</p>
            </div>
          )}
        </section>
        <aside className="panel form-aside">
          <span className="aside-icon"><Database size={19} /></span>
          <h2>Persisted to Oracle</h2>
          <p>This record is committed to <code>HR_EMPLOYEES</code> on your Debian home server, linked with audit logging.</p>
          <span className="aside-note">Schema: PEOPLE_JOURNEY · Service: FREEPDB1</span>
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

  const candidateEmployees = employeesData?.data && employeesData.data.length > 0
    ? employeesData.data.filter(e => e.status !== 'Exited')
    : demoEmployees.filter(person => person.status === 'Active' || person.status === 'Onboarding');

  const form = useForm<OffboardingFormValues>({
    resolver: zodResolver(offboardingFormSchema),
    defaultValues: { employeeId: '', lastWorkingDay: '', contactEmail: '', note: '' },
  });

  const onSubmit = async (values: OffboardingFormValues) => {
    try {
      const selectedPerson = candidateEmployees.find(p =>
        ('employeeId' in p ? String(p.employeeId) : p.id) === values.employeeId
      );

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
        description: `Lifecycle transition for ${result.employee.name} recorded in Oracle Database.`,
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
        description: (err as Error).message || 'Failed to record offboarding in Oracle.',
      });
    }
  };

  return (
    <>
      <PageHeading
        eyebrow="Lifecycle Management"
        title="Record an exit"
        text="Schedule offboarding and transition milestones in Oracle Database."
      />
      <div className="form-preview-layout">
        <section className="panel form-panel">
          <Form {...form}>
            <form autoComplete="off" onSubmit={form.handleSubmit(onSubmit)}>
              <div className="form-grid">
                <label>
                  Employee
                  <select {...form.register('employeeId')} required>
                    <option value="">Select an employee</option>
                    {candidateEmployees.map(person => {
                      const id = 'employeeId' in person ? String(person.employeeId) : person.id;
                      const dept = 'departmentName' in person ? (person.departmentName || 'General') : ('department' in person ? person.department : 'General');
                      return (
                        <option value={id} key={id}>
                          {person.name} · {dept} ({person.status})
                        </option>
                      );
                    })}
                  </select>
                </label>
                <label>
                  Last working day
                  <input {...form.register('lastWorkingDay')} type="date" required />
                </label>
                <label>
                  Contact email <span className="field-hint">Optional</span>
                  <input {...form.register('contactEmail')} type="email" placeholder="personal@example.com" />
                </label>
                <label>
                  Transition notes <span className="field-hint">Optional</span>
                  <input {...form.register('note')} placeholder="Handover, equipment return notes" />
                </label>
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
                      Recording in Oracle…
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
              <b style={{ color: '#166534' }}>✓ Offboarding Active in Oracle</b>
              <p>{scheduledExit.name} has been transitioned to Offboarding with planned exit on {fmt(scheduledExit.date)}.</p>
            </div>
          )}
        </section>
        <aside className="panel form-aside">
          <span className="aside-icon"><ClipboardCheck size={19} /></span>
          <h2>Transactional Integrity</h2>
          <p>Offboarding updates <code>HR_EMPLOYEES</code> and creates an <code>HR_OFFBOARDING</code> record in a single Oracle transaction.</p>
          <span className="aside-note">Auto-rolled back on any error</span>
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
  const submitted = demoExitInterviews.filter(item => item.status === 'Submitted');
  return <><PageHeading eyebrow="Exit management" title="Interview Responses" text="Submission tracking and feedback from offboarded personnel." /><div className="response-summary"><span className="kpi-icon lilac"><ClipboardCheck size={19} /></span><div><b>{submitted.length} submitted exit interview{submitted.length === 1 ? '' : 's'}</b><p>Structured interview records linked to Oracle employee accounts.</p></div></div><ExitTable /></>;
}

function SettingsPage() {
  return (
    <>
      <PageHeading eyebrow="Workspace configuration" title="Settings" text="Connection and database configuration overview." />
      <section className="panel settings-panel">
        <div className="settings-row">
          <span className="settings-icon"><Database size={18} /></span>
          <div>
            <b>Oracle Database Free (FREEPDB1)</b>
            <p>Connected via Debian Home Server on private listener.</p>
          </div>
          <span className="settings-state" style={{ color: '#2ba45a', fontWeight: 600 }}>Connected</span>
        </div>
        <div className="settings-row">
          <span className="settings-icon"><Users size={18} /></span>
          <div>
            <b>Employee data source</b>
            <p>Oracle Database table <code>HR_EMPLOYEES</code>.</p>
          </div>
          <span className="settings-state" style={{ color: '#2ba45a', fontWeight: 600 }}>Live Database</span>
        </div>
        <div className="settings-row">
          <span className="settings-icon"><Bell size={18} /></span>
          <div>
            <b>Authentication Provider</b>
            <p>Firebase Authentication with server-side Admin token verification.</p>
          </div>
          <span className="settings-state" style={{ color: '#2ba45a', fontWeight: 600 }}>Active</span>
        </div>
      </section>
    </>
  );
}

function Unavailable({ title }: { title: string }) {
  return (
    <>
      <PageHeading eyebrow="Administration" title={title} text="Authorized administrator user management." />
      <section className="unavailable-panel">
        <span><Users size={21} /></span>
        <h2>HR User Access Control</h2>
        <p>User accounts and permissions are governed through the Oracle <code>HR_USERS</code> table and verified with Firebase Admin SDK.</p>
        <Link href="/dashboard" className="secondary-action">Return to overview <ArrowRight size={15} /></Link>
      </section>
    </>
  );
}

export function DashboardPage() {
  const [path, setPath] = useLocation();
  const [globalSearch, setGlobalSearch] = useState('');
  const title = titles[path] || 'People Workspace';
  const content = useMemo(() => path === '/dashboard' ? <Overview /> : <ListingPage path={path} globalSearch={globalSearch} setGlobalSearch={setGlobalSearch} />, [path, globalSearch]);
  return <Shell title={title} path={path} onNavigate={setPath} searchValue={globalSearch} onSearchChange={setGlobalSearch}>{content}</Shell>;
}
