import { useState } from 'react';
import {
  Bell, Mail, Search, Send, Clock, UserCheck, AlertCircle,
  ExternalLink, ChevronLeft, ChevronRight, Loader2, Sparkles
} from 'lucide-react';
import { useEmployees } from '@/api/queries';
import type { Employee } from '@/types/api';
import { AnimatedSelect } from '@/components/ui/animated-select';
import { EmailPreparationDialog } from './email-preparation-dialog';

const fmt = (date: string | null | undefined) => {
  if (!date) return '—';
  const clean = date.slice(0, 10);
  const parts = clean.split('-').map(Number);
  if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) return date;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(parts[0], parts[1] - 1, parts[2])
  );
};

export function EmailNotificationsView() {
  const [page, setPage] = useState(0);
  const [pageSize] = useState(8);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  // Active email preparation dialog
  const [preparingEmployee, setPreparingEmployee] = useState<Employee | null>(null);

  const { data: employeeData, isLoading } = useEmployees({
    page: page + 1,
    limit: pageSize,
    search: search || undefined,
    status: statusFilter !== 'All' ? statusFilter : undefined,
  });

  const employees = employeeData?.data || [];
  const total = employeeData?.total || 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const getActionLabel = (emp: Employee) => {
    if (emp.employmentStatus === 'ONBOARDING') {
      return 'Prepare Welcome Email';
    }
    if (emp.employmentStatus === 'OFFBOARDING' || emp.exitDate) {
      return 'Prepare Last Day Email';
    }
    return 'Prepare Touchpoint';
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="page-eyebrow">Communication & Touchpoints</span>
          <h1>Email Notifications</h1>
          <p>
            Review personnel lifecycle stages and prepare personalized milestone communications for Gmail review.
          </p>
        </div>
        <button
          type="button"
          className="primary-action"
          onClick={() => setPreparingEmployee({} as Employee)}
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Mail size={16} /> Compose Lifecycle Email
        </button>
      </div>

      <section className="panel listing-panel">
        <div className="list-controls">
          <label className="list-search">
            <Search size={16} />
            <span className="sr-only">Search employees</span>
            <input
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="Search employee name, code, or email…"
            />
          </label>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: '#7a6673', fontWeight: 600, whiteSpace: 'nowrap' }}>Filter:</span>
            <AnimatedSelect
              variant="filter"
              value={statusFilter}
              onChange={val => {
                setStatusFilter(val);
                setPage(0);
              }}
              options={[
                { value: 'All', label: 'All Statuses' },
                { value: 'ONBOARDING', label: 'Onboarding' },
                { value: 'ACTIVE', label: 'Active' },
                { value: 'OFFBOARDING', label: 'Offboarding' },
                { value: 'EXITED', label: 'Exited' },
              ]}
              style={{ minWidth: '160px' }}
            />
          </div>
        </div>

        {isLoading ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#887582' }}>
            <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px auto', color: '#bd7b92' }} />
            <span>Loading personnel from database…</span>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <colgroup>
                <col style={{ width: '28%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '22%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department / Role</th>
                  <th>Joining Date</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Email Action</th>
                </tr>
              </thead>
              <tbody>
                {employees.map(person => {
                  const initials = person.name
                    ? person.name.split(' ').map((p: string) => p[0]).join('').slice(0, 2)
                    : 'EM';

                  return (
                    <tr key={person.employeeId}>
                      <td>
                        <span className="person-cell">
                          <span className="person-avatar">{initials}</span>
                          <span>
                            <b>{person.name}</b>
                            <small>{person.workEmail || 'Registered'}</small>
                          </span>
                        </span>
                      </td>
                      <td>
                        <span style={{ display: 'block', fontWeight: 600, color: '#3d2e37' }}>
                          {person.departmentName || 'General'}
                        </span>
                        <small style={{ color: '#88747f' }}>
                          {person.designationName || 'Team Member'}
                        </small>
                      </td>
                      <td>
                        <span>{fmt(person.hireDate)}</span>
                        {person.exitDate && (
                          <small style={{ display: 'block', color: '#be123c', fontSize: '10px' }}>
                            Exit: {fmt(person.exitDate)}
                          </small>
                        )}
                      </td>
                      <td>
                        <span
                          className={`status-badge status-${(person.status || 'Active').toLowerCase()}`}
                        >
                          {person.status || person.employmentStatus}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="primary-action"
                          onClick={() => setPreparingEmployee(person)}
                          style={{
                            fontSize: '11px',
                            padding: '6px 12px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          <Mail size={13} /> {getActionLabel(person)}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {employees.length === 0 && (
              <div className="table-empty">
                <Bell size={24} style={{ color: '#b5798e' }} />
                <b>No matching employees found</b>
                <span>
                  Employees in your workspace can receive automated lifecycle notifications. Add an employee to get started.
                </span>
              </div>
            )}
          </div>
        )}

        <div className="pagination">
          <span>
            Page {page + 1} of {pageCount} · {total} workspace records
          </span>
          <div>
            <button
              type="button"
              aria-label="Previous page"
              disabled={page === 0}
              onClick={() => setPage(Math.max(0, page - 1))}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              aria-label="Next page"
              disabled={page + 1 >= pageCount}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>

      {/* Email Preparation Dialog */}
      {preparingEmployee && (
        <EmailPreparationDialog
          isOpen={true}
          onClose={() => setPreparingEmployee(null)}
          initialEmployeeId={preparingEmployee.employeeId || undefined}
        />
      )}
    </>
  );
}
