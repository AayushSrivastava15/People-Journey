import { useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import {
  Activity, ArrowDownLeft, ArrowRight, Bell, BriefcaseBusiness, CalendarDays, Check,
  ChevronDown, ChevronLeft, ChevronRight, CircleHelp, ClipboardCheck, Clock3, DoorOpen,
  FileText, LayoutDashboard, ListFilter, LogOut, Menu, MessageSquareText, Search, Settings,
  UserCheck, Users, UsersRound, X,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Form } from '@/components/ui/form';
import { dateFromToday, demoDepartments, demoEmployees, demoExitInterviews, demoNotifications, employeeById, recentMonthBuckets, type LifecycleStatus, type NoticeStatus } from '@/lib/demo-data';
import { z } from 'zod';
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
  '/dashboard': 'Your People Overview', '/dashboard/employees': 'All Employees',
  '/dashboard/add-employee': 'Add an employee', '/dashboard/schedule-offboarding': 'Record an exit', '/dashboard/onboarding': 'Onboarding',
  '/dashboard/offboarding': 'Offboarding', '/dashboard/departments': 'Departments',
  '/dashboard/notifications': 'Email Notifications', '/dashboard/templates': 'Email Templates',
  '/dashboard/notification-history': 'Notification History', '/dashboard/exit-interviews': 'Exit Interviews',
  '/dashboard/interview-responses': 'Interview Responses', '/dashboard/hr-users': 'HR Users',
  '/dashboard/settings': 'Settings',
};
const statusClass: Record<string, string> = {
  Active: 'active', Onboarding: 'onboarding', Offboarding: 'offboarding', Exited: 'exited',
  Pending: 'pending', Processing: 'processing', Sent: 'sent', Failed: 'failed', Cancelled: 'cancelled',
  Invited: 'pending', Submitted: 'sent', Expired: 'cancelled',
};
const fmt = (date: string | null) => {
  if (!date) return '—';
  const [year, month, day] = date.slice(0, 10).split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(year, month - 1, day));
};

function DemoBanner() {
  return <div className="demo-banner" role="note"><span className="demo-banner-mark">DEMO ONLY</span><span>Fictional sample records · local preview only · nothing is saved or sent</span></div>;
}

function Shell({ children, title, path, onNavigate, searchValue, onSearchChange }: { children: ReactNode; title: string; path: string; onNavigate: (path: string) => void; searchValue: string; onSearchChange: (value: string) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { user, authRole, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    onNavigate('/login');
  };

  const displayName = user?.displayName || user?.email?.split('@')[0] || 'HR Team';
  const avatarLetter = (displayName[0] || 'H').toUpperCase();
  const roleLabel = authRole === 'hr_admin' ? 'Admin' : 'HR Staff';

  return <div className="dashboard-frame">
    <DemoBanner />
    <div className="dashboard-shell">
      <aside className={`dash-sidebar ${collapsed ? 'is-collapsed' : ''} ${menuOpen ? 'is-open' : ''}`} aria-label="Workspace navigation">
        <Link href="/dashboard" className="dash-brand"><span className="dash-brand-symbol" aria-hidden="true"><i /><i /><i /></span><span className="dash-brand-name">people<span>journey</span><small>DEMO WORKSPACE</small></span></Link>
        <div className="workspace-label">PEOPLE WORKSPACE</div>
        <nav className="dash-nav">
          {navGroups.map(group => <div className="nav-group" key={group.label}><p>{group.label}</p>{group.links.map(item => {
            const Icon = item.icon; const active = item.path === path;
            return <Link key={item.path} href={item.path} onClick={() => { setMenuOpen(false); onNavigate(item.path); }} className={`dash-nav-link ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined} title={collapsed ? item.label : undefined}><Icon size={17} strokeWidth={1.8} /><span>{item.label}</span>{item.path === '/dashboard/hr-users' && <small className="nav-unavailable">N/A</small>}</Link>;
          })}</div>)}
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
        <button className="collapse-sidebar" type="button" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}><ChevronLeft size={16} /></button>
      </aside>
      {menuOpen && <button className="nav-scrim" onClick={() => setMenuOpen(false)} aria-label="Close navigation" />}
      <main className="dash-main">
        <header className="dash-topbar">
          <button className="mobile-nav-toggle" aria-label="Open navigation" onClick={() => setMenuOpen(true)}><Menu size={20} /></button>
          <div className="breadcrumbs"><span>People Workspace</span><ChevronRight size={13} /><strong>{title}</strong></div>
          <label className="global-search"><Search size={16} /><span className="sr-only">Search fictional employee records</span><input value={searchValue} onChange={event => { const value = event.target.value; onSearchChange(value); if (value.trim() && path !== '/dashboard/employees') onNavigate('/dashboard/employees'); }} placeholder="Search sample people..." /><kbd>DEMO</kbd></label>
          <Link href="/dashboard/notifications" className="topbar-bell" aria-label="View notification preview"><Bell size={18} /><i>{demoNotifications.filter(item => item.status === 'Pending').length}</i></Link>
          <span className="topbar-date">{new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date())}</span>

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
        <div className="dash-content">{children}</div>
        <footer className="dash-footer">People Journey preview · Fictional data only · No connection to email or HR systems</footer>
      </main>
    </div>
    <span className="sr-only" aria-live="polite">{searchValue ? `Searching sample employee records for ${searchValue}` : ''}</span>
  </div>;
}

function Status({ value }: { value: LifecycleStatus | NoticeStatus | 'Invited' | 'Submitted' | 'Expired' }) {
  return <span className={`status-badge status-${statusClass[value] || 'neutral'}`}><i aria-hidden="true" />{value}</span>;
}

function PageHeading({ eyebrow, title, text, action }: { eyebrow?: string; title: string; text: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <span className="page-eyebrow">{eyebrow}</span>}<h1>{title}</h1><p>{text}</p></div>{action}</div>;
}

function EmployeeTable({ people, compact = false }: { people: typeof demoEmployees; compact?: boolean }) {
  return <div className="table-scroll"><table className="data-table"><thead><tr><th>Employee</th><th>Department</th><th>Manager</th><th>Joining date</th>{!compact && <th>Last working day</th>}<th>Status</th></tr></thead><tbody>{people.map(person => <tr key={person.id}><td><span className="person-cell"><span className="person-avatar">{person.name.split(' ').map(part => part[0]).join('')}</span><span><b>{person.name}</b><small>{person.workEmail}</small></span></span></td><td>{person.department}</td><td>{person.manager}</td><td>{fmt(person.joiningDate)}</td>{!compact && <td>{fmt(person.lastWorkingDay)}</td>}<td><Status value={person.status} /></td></tr>)}</tbody></table>{people.length === 0 && <div className="table-empty"><UsersRound size={22} /><b>No matching sample records</b><span>Try another search or clear the filter.</span></div>}</div>;
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
  const stats = [
    { label: 'Total employees', value: demoEmployees.filter(p => p.status === 'Active').length, icon: UsersRound, tone: 'rose', href: '/dashboard/employees', note: 'Active sample records' },
    { label: 'Joining this month', value: demoEmployees.filter(p => p.joiningDate.startsWith(currentMonth)).length, icon: CalendarDays, tone: 'peach', href: '/dashboard/onboarding', note: 'Current calendar month · sample dates' },
    { label: 'Upcoming joiners', value: demoEmployees.filter(p => p.status === 'Onboarding' && p.joiningDate >= today && p.joiningDate <= nextWeek).length, icon: DoorOpen, tone: 'lilac', href: '/dashboard/onboarding', note: 'Joining within the next 7 days' },
    { label: 'Upcoming exits', value: demoEmployees.filter(p => p.status === 'Offboarding' && p.lastWorkingDay !== null && p.lastWorkingDay >= today && p.lastWorkingDay <= nextWeek).length, icon: ArrowDownLeft, tone: 'peach', href: '/dashboard/offboarding', note: 'Last day within the next 7 days' },
    { label: 'Pending notifications', value: demoNotifications.filter(p => p.status === 'Pending' || p.status === 'Processing').length, icon: Bell, tone: 'butter', href: '/dashboard/notifications', note: 'Preview jobs, not email delivery' },
    { label: 'Completed interviews', value: demoExitInterviews.filter(p => p.status === 'Submitted').length, icon: ClipboardCheck, tone: 'lilac', href: '/dashboard/interview-responses', note: 'Submitted sample responses' },
  ];
  const statuses: LifecycleStatus[] = ['Active', 'Onboarding', 'Offboarding', 'Exited'];
  const statusData = statuses.map(name => ({ name, value: demoEmployees.filter(p => p.status === name).length }));
  const colors = ['#d99bad', '#e7b993', '#bcb1d8', '#d7c9bd'];
  const months = recentMonthBuckets(6);
  const activity = months.map(bucket => ({
    month: bucket.label,
    joining: demoEmployees.filter(person => person.joiningDate.slice(0, 7) === bucket.key).length,
    exits: demoEmployees.filter(person => person.lastWorkingDay?.slice(0, 7) === bucket.key).length,
  }));
  const events = [
    ...demoEmployees.filter(p => p.status === 'Onboarding').map(p => ({ id: p.id, person: p.name, label: 'Joining date', date: p.joiningDate, status: p.status, path: '/dashboard/onboarding' })),
    ...demoEmployees.filter(p => p.status === 'Offboarding').map(p => ({ id: p.id, person: p.name, label: 'Last working day', date: p.lastWorkingDay || '', status: p.status, path: '/dashboard/offboarding' })),
    ...demoNotifications.filter(p => p.status === 'Pending').map(p => ({ id: p.id, person: employeeById(p.employeeId)?.name || 'Sample employee', label: p.type, date: p.scheduledDate, status: p.status, path: '/dashboard/notifications' })),
  ].filter(event => event.date >= today && event.date <= dateFromToday(14)).sort((a, b) => a.date.localeCompare(b.date));
  const filteredNotices = demoNotifications.filter(item => activityFilter === 'All' || item.status === activityFilter);
  const shownNotices = filteredNotices.slice(page * 3, page * 3 + 3);
  return <>
    <PageHeading eyebrow="A thoughtful week ahead" title="Your People Overview" text="Everything happening across onboarding, offboarding, and employee communications." action={<div className="page-actions"><Link href="/dashboard/add-employee" className="primary-action"><Users size={17} /> Add Employee</Link><Link href="/dashboard/schedule-offboarding" className="secondary-action"><ArrowDownLeft size={16} /> Record an Exit</Link></div>} />
    <div className="preview-callout"><span className="callout-mark">PREVIEW</span><div><b>What you see here is a safe, fictional walkthrough.</b><p>Counts and charts are derived from the sample records below. Nothing is connected, stored, or sent.</p></div></div>
    <section className="kpi-grid" aria-label="Sample workspace summary">{stats.map(item => { const Icon = item.icon; return <Link href={item.href} className="kpi-card" key={item.label}><span className={`kpi-icon ${item.tone}`}><Icon size={19} /></span><span className="kpi-label">{item.label}</span><b className="kpi-value">{item.value}</b><small>{item.note}</small><ArrowRight className="kpi-arrow" size={15} /></Link>; })}</section>
    <div className="overview-grid">
      <section className="panel chart-panel"><div className="panel-heading"><div><span className="panel-kicker">SAMPLE RECORDS · LAST 6 MONTHS</span><h2>Employee journey overview</h2><p>Joining dates and last working days in the demo dataset.</p></div><span className="chart-key"><i /> Joining <i className="key-exit" /> Exits</span></div>
        <div className="chart-box"><ResponsiveContainer width="100%" height="100%"><BarChart data={activity} margin={{ top: 6, right: 8, bottom: 0, left: -20 }}><CartesianGrid stroke="#f2e8e7" vertical={false} /><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#95858e', fontSize: 11 }} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#a99ba2', fontSize: 10 }} /><Tooltip contentStyle={{ border: '1px solid #f0e5e5', borderRadius: 12, fontSize: 12, background: '#fffdfa' }} /><Bar dataKey="joining" name="Joining" fill="#dfabb9" radius={[5, 5, 0, 0]} /><Bar dataKey="exits" name="Exits" fill="#c5b9dc" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div>
      </section>
      <section className="panel distribution-panel"><div className="panel-heading"><div><span className="panel-kicker">ONE STATUS PER PERSON</span><h2>Status distribution</h2><p>Based on lifecycle status fields.</p></div></div><div className="donut-wrap"><ResponsiveContainer width="100%" height={190}><PieChart><Pie data={statusData} dataKey="value" nameKey="name" innerRadius={57} outerRadius={78} paddingAngle={3} stroke="none">{statusData.map((entry, index) => <Cell key={entry.name} fill={colors[index]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer><div className="donut-total"><b>{demoEmployees.length}</b><span>people</span></div></div><div className="distribution-legend">{statusData.map((entry, index) => <span key={entry.name}><i style={{ background: colors[index] }} />{entry.name}<b>{entry.value}</b></span>)}</div></section>
    </div>
    <div className="overview-grid lower-grid">
      <section className="panel"><div className="panel-heading"><div><span className="panel-kicker">DATES & PLANNED TOUCHPOINTS</span><h2>Today & coming up</h2><p>Events from fictional employee and notification records.</p></div><CalendarDays size={18} className="heading-icon" /></div><div className="event-list">{events.slice(0, 5).map(event => <article className="event-item" key={event.id}><span className="event-node" /><div className="event-copy"><b>{event.person}</b><span>{event.label} · {fmt(event.date)}</span></div><Status value={event.status as LifecycleStatus | NoticeStatus} /><Link href={event.path} className="icon-link" aria-label={`View ${event.person} ${event.label}`}><ArrowRight size={15} /></Link></article>)}{events.length === 0 && <p className="empty-inline">No sample events scheduled.</p>}</div></section>
      <section className="panel quick-panel"><div className="panel-heading"><div><span className="panel-kicker">A FEW USEFUL SHORTCUTS</span><h2>Quick actions</h2><p>Explore an area of this preview.</p></div></div><div className="quick-links"><Link href="/dashboard/add-employee"><Users size={17} />Add employee<ChevronRight size={15} /></Link><Link href="/dashboard/schedule-offboarding"><ArrowDownLeft size={17} />Schedule offboarding<ChevronRight size={15} /></Link><Link href="/dashboard/employees"><UsersRound size={17} />View employees<ChevronRight size={15} /></Link><Link href="/dashboard/exit-interviews"><MessageSquareText size={17} />Review exit interviews<ChevronRight size={15} /></Link><Link href="/dashboard/templates"><FileText size={17} />Explore email templates<ChevronRight size={15} /></Link><Link href="/dashboard/notification-history"><Activity size={17} />View notification logs<ChevronRight size={15} /></Link></div></section>
    </div>
    <section className="panel notification-panel"><div className="panel-heading panel-heading-wrap"><div><span className="panel-kicker">PLANNED WORKFLOW ACTIVITY · FICTIONAL</span><h2>Notification activity</h2><p>These are example job records only. No email has been delivered or attempted.</p></div><label className="filter-select"><ListFilter size={15} /><span className="sr-only">Filter notification status</span><select value={activityFilter} onChange={event => { setActivityFilter(event.target.value); setPage(0); }}><option>All</option>{(['Pending', 'Processing', 'Sent', 'Failed', 'Cancelled'] as NoticeStatus[]).map(status => <option key={status}>{status}</option>)}</select><ChevronDown size={14} /></label></div><NotificationTable rows={shownNotices} /><div className="pagination"><span>Showing {filteredNotices.length ? page * 3 + 1 : 0}–{Math.min((page + 1) * 3, filteredNotices.length)} of {filteredNotices.length} sample jobs</span><div><button type="button" aria-label="Previous page" disabled={page === 0} onClick={() => setPage(Math.max(0, page - 1))}><ChevronLeft size={16} /></button><button type="button" aria-label="Next page" disabled={(page + 1) * 3 >= filteredNotices.length} onClick={() => setPage(page + 1)}><ChevronRight size={16} /></button></div></div></section>
  </>;
}

function ListingPage({ path, globalSearch, setGlobalSearch }: { path: string; globalSearch: string; setGlobalSearch: (value: string) => void }) {
  const [status, setStatus] = useState('All statuses');
  const [page, setPage] = useState(0);
  const title = titles[path] || 'People Workspace';
  if (path === '/dashboard/hr-users') return <Unavailable title={title} />;
  if (path === '/dashboard/add-employee') return <AddEmployee />;
  if (path === '/dashboard/schedule-offboarding') return <ScheduleOffboarding />;
  if (path === '/dashboard/settings') return <SettingsPage />;
  if (path === '/dashboard/templates') return <TemplatesPage />;
  if (path === '/dashboard/interview-responses') return <ResponsesPage />;
  const desc: Record<string, string> = {
    '/dashboard/employees': 'A searchable directory of fictional employee records for this walkthrough.',
    '/dashboard/onboarding': 'Sample employee journeys marked as onboarding. No workflow is running.',
    '/dashboard/offboarding': 'Sample transition records with last working day context.',
    '/dashboard/departments': 'Department groupings are derived from the sample employee list.',
    '/dashboard/notifications': 'Notification job previews only; nothing is queued with a provider or sent.',
    '/dashboard/notification-history': 'Fictional notification history for explaining the operational view.',
    '/dashboard/exit-interviews': 'Invitation status and expiry dates in the sample dataset.',
  };
  const peopleMode = ['/dashboard/employees', '/dashboard/onboarding', '/dashboard/offboarding', '/dashboard/departments'].includes(path);
  const notificationMode = ['/dashboard/notifications', '/dashboard/notification-history'].includes(path);
  if (path === '/dashboard/exit-interviews') return <><PageHeading eyebrow="Exit management · sample records" title={title} text={desc[path]} /><ExitTable /></>;
  let people = demoEmployees;
  if (path === '/dashboard/onboarding') people = people.filter(p => p.status === 'Onboarding');
  if (path === '/dashboard/offboarding') people = people.filter(p => p.status === 'Offboarding');
  if (path === '/dashboard/departments') people = people;
  const filteredPeople = people.filter(person => `${person.name} ${person.department} ${person.manager} ${person.workEmail}`.toLowerCase().includes(globalSearch.toLowerCase()) && (status === 'All statuses' || person.status === status));
  const filteredNotifications = demoNotifications.filter(item => `${employeeById(item.employeeId)?.name} ${item.type} ${item.recipient}`.toLowerCase().includes(globalSearch.toLowerCase()) && (status === 'All statuses' || item.status === status));
  const pageSize = 5;
  const pageCount = Math.max(1, Math.ceil((peopleMode ? filteredPeople.length : filteredNotifications.length) / pageSize));
  return <><PageHeading eyebrow="Fictional sample records" title={title} text={desc[path] || 'A clear view of employee journey records.'} action={peopleMode && <Link href="/dashboard/add-employee" className="primary-action"><Users size={17} /> Add Employee</Link>} />
    {path === '/dashboard/departments' && <div className="department-strip">{demoDepartments.map(dept => <span key={dept}>{dept}<b>{demoEmployees.filter(p => p.department === dept).length}</b></span>)}</div>}
    <section className="panel listing-panel"><div className="list-controls"><label className="list-search"><Search size={16} /><span className="sr-only">Search {title}</span><input value={globalSearch} onChange={event => { setGlobalSearch(event.target.value); setPage(0); }} placeholder="Search name, department, manager..." /></label><label className="filter-select"><ListFilter size={15} /><span className="sr-only">Filter status</span><select value={status} onChange={event => { setStatus(event.target.value); setPage(0); }}><option>All statuses</option>{(notificationMode ? ['Pending', 'Processing', 'Sent', 'Failed', 'Cancelled'] : ['Active', 'Onboarding', 'Offboarding', 'Exited']).map(value => <option key={value}>{value}</option>)}</select><ChevronDown size={14} /></label></div>{peopleMode ? <EmployeeTable people={filteredPeople.slice(page * pageSize, (page + 1) * pageSize)} /> : <NotificationTable rows={filteredNotifications.slice(page * pageSize, (page + 1) * pageSize)} />}<div className="pagination"><span>Page {page + 1} of {pageCount} · {peopleMode ? filteredPeople.length : filteredNotifications.length} sample records</span><div><button type="button" aria-label="Previous page" disabled={page === 0} onClick={() => setPage(Math.max(0, page - 1))}><ChevronLeft size={16} /></button><button type="button" aria-label="Next page" disabled={page + 1 >= pageCount} onClick={() => setPage(page + 1)}><ChevronRight size={16} /></button></div></div></section>
  </>;
}

function ExitTable() {
  return <section className="panel listing-panel"><p className="inline-notice">Interview invitations are sample states only; links do not exist and no messages are sent.</p><div className="table-scroll"><table className="data-table"><thead><tr><th>Employee</th><th>Interview status</th><th>Link expiry</th><th>Preview details</th></tr></thead><tbody>{demoExitInterviews.map(row => <tr key={row.id}><td>{employeeById(row.employeeId)?.name}</td><td><Status value={row.status} /></td><td>{fmt(row.expires)}</td><td><button className="text-action" disabled title="Interview link preview unavailable">Link unavailable</button></td></tr>)}</tbody></table></div></section>;
}

const employeePreviewSchema = z.object({
  fullName: z.string().trim().min(1, 'Enter a fictional name.'),
  personalEmail: z.union([z.string().email(), z.literal('')]),
  workEmail: z.union([z.string().email(), z.literal('')]),
  department: z.string().min(1, 'Choose a department.'),
  manager: z.string(),
  joiningDate: z.string(),
  lastWorkingDay: z.string(),
  status: z.enum(['Active', 'Onboarding', 'Offboarding', 'Exited']),
});
type EmployeePreviewValues = z.infer<typeof employeePreviewSchema>;

function AddEmployee() {
  const [preview, setPreview] = useState<EmployeePreviewValues | null>(null);
  const form = useForm<EmployeePreviewValues>({
    resolver: zodResolver(employeePreviewSchema),
    defaultValues: { fullName: '', personalEmail: '', workEmail: '', department: '', manager: '', joiningDate: '', lastWorkingDay: '', status: 'Onboarding' },
  });
  const previewRows: [string, string][] = preview ? [
    ['Name', preview.fullName], ['Personal email', preview.personalEmail], ['Work email', preview.workEmail],
    ['Department', preview.department], ['Manager', preview.manager], ['Joining date', preview.joiningDate],
    ['Last working day', preview.lastWorkingDay], ['Lifecycle status', preview.status],
  ] : [];
  return <><PageHeading eyebrow="A local form preview" title="Add an employee" text="Explore the shape of an employee record without creating or saving one." /><div className="form-preview-layout"><section className="panel form-panel"><div className="inline-notice">This form is illustrative only. Submitting will not add a record, persist data, or contact anyone.</div><Form {...form}><form autoComplete="off" onSubmit={form.handleSubmit(values => setPreview(values))}><div className="form-grid"><label>Full name<input {...form.register('fullName')} required placeholder="e.g. Avery Morgan" /></label><label>Personal email<input {...form.register('personalEmail')} type="email" placeholder="name@example.test" /></label><label>Work email<input {...form.register('workEmail')} type="email" placeholder="name@sample.test" /></label><label>Department<select {...form.register('department')}><option value="">Select department</option>{demoDepartments.map(dept => <option key={dept}>{dept}</option>)}</select></label><label>Manager<input {...form.register('manager')} placeholder="Manager name" /></label><label>Joining date<input {...form.register('joiningDate')} type="date" /></label><label>Last working day <span className="field-hint">Optional</span><input {...form.register('lastWorkingDay')} type="date" /></label><label>Lifecycle status<select {...form.register('status')}><option>Active</option><option>Onboarding</option><option>Offboarding</option><option>Exited</option></select></label></div>{Object.keys(form.formState.errors).length > 0 && <p className="field-error" role="alert">Please check the required fields and email addresses.</p>}<div className="form-actions"><button type="submit" className="primary-action"><Check size={16} /> Preview form values</button><button type="button" className="secondary-action" onClick={() => { form.reset(); setPreview(null); }}>Clear fields</button></div></form></Form>{preview && <div className="preview-result" role="status"><b>Preview only</b><p>These values were not added to sample records and will disappear when you leave this page.</p><dl className="preview-values">{previewRows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Not provided'}</dd></div>)}</dl></div>}</section><aside className="panel form-aside"><span className="aside-icon"><UsersRound size={19} /></span><h2>Keep the person in view</h2><p>A production workflow would help the team coordinate the first-day details and the small things that make someone feel expected.</p><span className="aside-note">No employee data is retained in this demo.</span></aside></div></>;
}

const offboardingPreviewSchema = z.object({
  employeeId: z.string().min(1, 'Choose a fictional employee.'),
  lastWorkingDay: z.string().min(1, 'Choose a sample date.'),
  contactEmail: z.union([z.string().email(), z.literal('')]),
  note: z.string(),
});
type OffboardingPreviewValues = z.infer<typeof offboardingPreviewSchema>;

function ScheduleOffboarding() {
  const [preview, setPreview] = useState<OffboardingPreviewValues | null>(null);
  const form = useForm<OffboardingPreviewValues>({
    resolver: zodResolver(offboardingPreviewSchema),
    defaultValues: { employeeId: '', lastWorkingDay: '', contactEmail: '', note: '' },
  });
  const employee = demoEmployees.find(person => person.id === preview?.employeeId);
  return <><PageHeading eyebrow="A local form preview" title="Record an exit" text="Explore an offboarding record without changing sample data or creating notifications." /><div className="form-preview-layout"><section className="panel form-panel"><div className="inline-notice">This preview does not update an employee, create a workflow, save data, or send email.</div><Form {...form}><form autoComplete="off" onSubmit={form.handleSubmit(values => setPreview(values))}><div className="form-grid"><label>Fictional employee<select {...form.register('employeeId')}><option value="">Select an employee</option>{demoEmployees.filter(person => person.status === 'Active' || person.status === 'Onboarding').map(person => <option value={person.id} key={person.id}>{person.name} · {person.department}</option>)}</select></label><label>Last working day<input {...form.register('lastWorkingDay')} type="date" /></label><label>Contact email <span className="field-hint">Optional</span><input {...form.register('contactEmail')} type="email" placeholder="name@example.test" /></label><label>Note <span className="field-hint">Optional</span><input {...form.register('note')} placeholder="Short demo note" /></label></div>{Object.keys(form.formState.errors).length > 0 && <p className="field-error" role="alert">Choose an employee, a date, and a valid optional email.</p>}<div className="form-actions"><button type="submit" className="primary-action"><Check size={16} /> Preview offboarding</button><button type="button" className="secondary-action" onClick={() => { form.reset(); setPreview(null); }}>Clear fields</button></div></form></Form>{preview && <div className="preview-result" role="status"><b>Preview only · no changes made</b><p>{employee?.name || 'Sample employee'} · Last working day {fmt(preview.lastWorkingDay)}. No record was changed and no email was sent.</p><small>Optional contact: {preview.contactEmail || 'Not provided'} · Note: {preview.note || 'Not provided'}</small></div>}</section><aside className="panel form-aside"><span className="aside-icon"><ClipboardCheck size={19} /></span><h2>Close the loop with care</h2><p>A production workflow would keep the final date, communication plan, and exit interview steps together.</p><span className="aside-note">No employee data is retained in this demo.</span></aside></div></>;
}

function TemplatesPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const templates = [
    { title: 'A warm welcome', type: 'Onboarding · day one', body: 'We are glad you are here. Here is a gentle guide to your first day and the people who can help.' },
    { title: 'First-week check-in', type: 'Onboarding · week one', body: 'How has your first week felt? Share what is clear and what would make settling in easier.' },
    { title: 'A thoughtful farewell', type: 'Offboarding · transition', body: 'Thank you for the care you have brought to this chapter. Here are the practical details for your next steps.' },
  ];
  return <><PageHeading eyebrow="Communication · examples" title="Email Templates" text="Copy concepts for thoughtful touchpoints. These previews cannot send email." /><div className="template-grid">{templates.map((template, index) => <article className="panel template-card" key={template.title}><span className={`template-icon tone-${index}`}><FileText size={19} /></span><span className="panel-kicker">{template.type}</span><h2>{template.title}</h2><p>{template.body}</p><button className="secondary-action" onClick={() => setSelected(selected === template.title ? null : template.title)}>{selected === template.title ? 'Close preview' : 'Preview copy'}</button>{selected === template.title && <div className="template-preview" role="status"><b>Copy preview</b><p>{template.body}</p><small>Not connected to a recipient or email service.</small></div>}</article>)}</div></>;
}

function ResponsesPage() {
  const submitted = demoExitInterviews.filter(item => item.status === 'Submitted');
  return <><PageHeading eyebrow="Exit management · sample response status" title="Interview Responses" text="Submission status is available in this fictional dataset; interview answers are not included." /><div className="response-summary"><span className="kpi-icon lilac"><ClipboardCheck size={19} /></span><div><b>{submitted.length} submitted sample response{submitted.length === 1 ? '' : 's'}</b><p>No interview content or personal reflections are stored in this preview.</p></div></div><ExitTable /></>;
}

function SettingsPage() {
  return <><PageHeading eyebrow="Workspace configuration" title="Settings" text="Production preferences are not configured in this standalone preview." /><section className="panel settings-panel"><div className="settings-row"><span className="settings-icon"><Bell size={18} /></span><div><b>Notification delivery</b><p>Email provider connection is unavailable. This demo sends nothing.</p></div><span className="settings-state">Not connected</span></div><div className="settings-row"><span className="settings-icon"><Users size={18} /></span><div><b>Employee data source</b><p>All visible records come from a local fictional mock-data module.</p></div><span className="settings-state">Sample data</span></div><div className="settings-row"><span className="settings-icon"><Settings size={18} /></span><div><b>Workspace preferences</b><p>Configuration changes are disabled in demo-only mode.</p></div><button type="button" className="secondary-action" disabled title="Settings cannot be saved">Unavailable</button></div></section></>;
}

function Unavailable({ title }: { title: string }) {
  return <><PageHeading eyebrow="Administration" title={title} text="This destination is intentionally unavailable in the demo-only workspace." /><section className="unavailable-panel"><span><Users size={21} /></span><h2>HR-user administration is not available</h2><p>This preview has no sign-in, user registry, authentication, or permission system. No user accounts are represented or managed here.</p><Link href="/dashboard" className="secondary-action">Return to overview <ArrowRight size={15} /></Link></section></>;
}

export function DashboardPage() {
  const [path, setPath] = useLocation();
  const [globalSearch, setGlobalSearch] = useState('');
  const title = titles[path] || 'People Workspace';
  const content = useMemo(() => path === '/dashboard' ? <Overview /> : <ListingPage path={path} globalSearch={globalSearch} setGlobalSearch={setGlobalSearch} />, [path, globalSearch]);
  return <Shell title={title} path={path} onNavigate={setPath} searchValue={globalSearch} onSearchChange={setGlobalSearch}>{content}</Shell>;
}
