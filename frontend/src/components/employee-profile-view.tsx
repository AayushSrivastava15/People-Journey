import { useState } from 'react';
import { useLocation } from 'wouter';
import {
  ArrowLeft,
  Building2,
  Calendar,
  Check,
  Clock,
  Copy,
  ExternalLink,
  Hash,
  Loader2,
  Mail,
  Pencil,
  Phone,
  ShieldCheck,
  Trash2,
  User,
  UserCheck,
} from 'lucide-react';
import {
  useEmployee,
  useDepartments,
  useDesignations,
} from '@/api/queries';
import { useToast } from '@/hooks/use-toast';
import { EditEmployeeDialog } from '@/components/edit-employee-dialog';
import { DeleteEmployeeDialog } from '@/components/delete-employee-dialog';
import type { Employee as ApiEmployee } from '@/types/api';

const statusClass: Record<string, string> = {
  Active: 'active',
  Onboarding: 'onboarding',
  Offboarding: 'offboarding',
  Exited: 'exited',
};

const formatDate = (dateStr?: string | null) => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime())
      ? dateStr
      : new Intl.DateTimeFormat(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }).format(d);
  } catch {
    return dateStr;
  }
};

export function EmployeeProfileView({ idOrUuid }: { idOrUuid: string }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: employee, isLoading, isError, error } = useEmployee(idOrUuid);
  const { data: departments = [] } = useDepartments();
  const { data: designations = [] } = useDesignations();

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [copiedUuid, setCopiedUuid] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const handleCopyUuid = async () => {
    const identifier = employee?.uuid || idOrUuid;
    try {
      await navigator.clipboard.writeText(identifier);
      setCopiedUuid(true);
      toast({
        title: 'UUID Copied',
        description: 'Resource UUID copied to your clipboard.',
      });
      setTimeout(() => setCopiedUuid(false), 2000);
    } catch {
      toast({
        variant: 'destructive',
        title: 'Copy Failed',
        description: 'Unable to access clipboard.',
      });
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      toast({
        title: 'Unique URL Copied',
        description: 'Permanent employee resource link copied to clipboard.',
      });
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      toast({
        variant: 'destructive',
        title: 'Copy Failed',
        description: 'Unable to access clipboard.',
      });
    }
  };

  if (isLoading) {
    return (
      <div style={{ padding: '32px 0' }}>
        <button
          type="button"
          onClick={() => setLocation('/dashboard/employees')}
          className="secondary-action"
          style={{ marginBottom: 24, display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <ArrowLeft size={15} /> Back to All Employees
        </button>
        <div
          style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #ebd9df',
            padding: '60px 24px',
            textAlign: 'center',
            color: '#887582',
          }}
        >
          <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto 12px', color: '#bd7b92' }} />
          <p style={{ fontSize: 16, fontWeight: 600, color: '#3d3035', margin: 0 }}>
            Loading Employee Profile...
          </p>
          <p style={{ fontSize: 13, color: '#887582', marginTop: 4 }}>
            Resolving unique resource identifier {idOrUuid}
          </p>
        </div>
      </div>
    );
  }

  if (isError || !employee) {
    return (
      <div style={{ padding: '32px 0' }}>
        <button
          type="button"
          onClick={() => setLocation('/dashboard/employees')}
          className="secondary-action"
          style={{ marginBottom: 24, display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <ArrowLeft size={15} /> Back to All Employees
        </button>
        <div
          style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #f2cfcf',
            padding: '48px 24px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: '50%',
              background: '#fde8e8',
              color: '#d64545',
              display: 'grid',
              placeItems: 'center',
              margin: '0 auto 16px',
            }}
          >
            <User size={26} />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#272023', margin: 0 }}>
            Employee Not Found
          </h2>
          <p style={{ fontSize: 14, color: '#887582', maxWidth: 460, margin: '8px auto 20px' }}>
            No employee with resource identifier <code style={{ background: '#f5eded', padding: '2px 6px', borderRadius: 4 }}>{idOrUuid}</code> exists in your workspace, or you do not have permission to access it.
          </p>
          <button
            type="button"
            onClick={() => setLocation('/dashboard/employees')}
            className="primary-action"
          >
            Return to Employee Directory
          </button>
        </div>
      </div>
    );
  }

  const initials = employee.name
    ? employee.name
        .split(' ')
        .map((p: string) => p[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'EM';

  const badgeClass = statusClass[employee.status] || 'active';

  return (
    <div style={{ padding: '16px 0 48px' }}>
      {/* Navigation Breadcrumb */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          type="button"
          onClick={() => setLocation('/dashboard/employees')}
          className="secondary-action"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}
        >
          <ArrowLeft size={15} /> Back to All Employees
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={handleCopyLink}
            className="secondary-action"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}
            title="Copy unique permanent URL to clipboard"
          >
            {copiedLink ? <Check size={14} color="#2e7d32" /> : <Copy size={14} />}
            {copiedLink ? 'Link Copied!' : 'Copy Resource Link'}
          </button>
          <button
            type="button"
            onClick={() => setEditDialogOpen(true)}
            className="secondary-action"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}
          >
            <Pencil size={14} /> Edit Profile
          </button>
          <button
            type="button"
            onClick={() => setDeleteDialogOpen(true)}
            className="secondary-action"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              color: '#c44558',
              borderColor: '#f2cfcf',
            }}
          >
            <Trash2 size={14} /> Delete
          </button>
        </div>
      </div>

      {/* Main Employee Profile Card */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: 16,
          border: '1px solid #ebd9df',
          boxShadow: '0 4px 16px rgba(39, 32, 35, 0.04)',
          overflow: 'hidden',
          marginBottom: 24,
        }}
      >
        {/* Top Header Banner */}
        <div
          style={{
            background: 'linear-gradient(135deg, #fbf7f6 0%, #f7eef2 100%)',
            padding: '28px 32px',
            borderBottom: '1px solid #ebd9df',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 20,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #bd7b92 0%, #9e5b74 100%)',
                color: '#ffffff',
                display: 'grid',
                placeItems: 'center',
                fontSize: 24,
                fontWeight: 700,
                letterSpacing: 1,
                boxShadow: '0 4px 12px rgba(189, 123, 146, 0.25)',
              }}
            >
              {initials}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: 24, fontWeight: 800, color: '#272023', margin: 0 }}>
                  {employee.name}
                </h1>
                <span className={`status-badge status-${badgeClass}`} style={{ textTransform: 'capitalize' }}>
                  {employee.status}
                </span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: 14, color: '#7a6773' }}>
                {employee.designationName || 'Team Member'} · {employee.departmentName || 'General Department'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: '#887582',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Hash size={13} /> Code: <strong>{employee.employeeCode}</strong>
            </span>
            <span
              style={{
                fontSize: 12,
                color: '#887582',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <ShieldCheck size={13} color="#2e7d32" /> Workspace RLS Secured
            </span>
          </div>
        </div>

        {/* Stable UUID Resource Identifier Bar (Google Drive-style unique resource) */}
        <div
          style={{
            background: '#faf6f8',
            padding: '14px 32px',
            borderBottom: '1px solid #ebd9df',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            fontSize: 13,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, color: '#6e5a67' }}>Stable Resource UUID:</span>
            <code
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                background: '#ffffff',
                border: '1px solid #dfc9d0',
                padding: '4px 10px',
                borderRadius: 6,
                color: '#272023',
                fontSize: 12,
                userSelect: 'all',
              }}
            >
              {employee.uuid || idOrUuid}
            </code>
            <button
              type="button"
              onClick={handleCopyUuid}
              style={{
                background: 'none',
                border: 'none',
                color: '#bd7b92',
                cursor: 'pointer',
                padding: '2px 6px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {copiedUuid ? <Check size={13} color="#2e7d32" /> : <Copy size={13} />}
              {copiedUuid ? 'Copied' : 'Copy UUID'}
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, color: '#887582', fontSize: 12 }}>
            <span>Database Index: #{employee.employeeId}</span>
            <span>URL: /dashboard/employees/{employee.uuid || employee.employeeId}</span>
          </div>
        </div>

        {/* Profile Content Grids */}
        <div style={{ padding: '32px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 28 }}>
          {/* Section 1: Contact Information */}
          <div
            style={{
              background: '#fcfaf9',
              borderRadius: 12,
              border: '1px solid #eee4e5',
              padding: 20,
            }}
          >
            <h3
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: '#272023',
                margin: '0 0 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Mail size={16} color="#bd7b92" /> Contact Information
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
              <div>
                <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#887582', textTransform: 'uppercase' }}>
                  Work Email
                </span>
                {employee.workEmail ? (
                  <a
                    href={`mailto:${employee.workEmail}`}
                    style={{ color: '#bd7b92', textDecoration: 'none', fontWeight: 500 }}
                  >
                    {employee.workEmail}
                  </a>
                ) : (
                  <span style={{ color: '#b5a4ac' }}>—</span>
                )}
              </div>

              <div>
                <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#887582', textTransform: 'uppercase' }}>
                  Personal Email
                </span>
                <span style={{ color: employee.personalEmail ? '#272023' : '#b5a4ac' }}>
                  {employee.personalEmail || '—'}
                </span>
              </div>

              <div>
                <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#887582', textTransform: 'uppercase' }}>
                  Contact Phone
                </span>
                <span style={{ color: employee.phone ? '#272023' : '#b5a4ac' }}>
                  {employee.phone || '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Section 2: Organization & Role */}
          <div
            style={{
              background: '#fcfaf9',
              borderRadius: 12,
              border: '1px solid #eee4e5',
              padding: 20,
            }}
          >
            <h3
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: '#272023',
                margin: '0 0 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Building2 size={16} color="#bd7b92" /> Organization & Position
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
              <div>
                <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#887582', textTransform: 'uppercase' }}>
                  Department
                </span>
                <span style={{ fontWeight: 600, color: '#272023' }}>
                  {employee.departmentName || 'General Department'}
                </span>
              </div>

              <div>
                <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#887582', textTransform: 'uppercase' }}>
                  Role / Designation
                </span>
                <span style={{ fontWeight: 600, color: '#272023' }}>
                  {employee.designationName || 'Team Member'}
                </span>
              </div>

              <div>
                <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#887582', textTransform: 'uppercase' }}>
                  Employment Status
                </span>
                <span style={{ textTransform: 'capitalize', color: '#272023' }}>
                  {employee.employmentStatus.toLowerCase()}
                </span>
              </div>
            </div>
          </div>

          {/* Section 3: Timeline & Dates */}
          <div
            style={{
              background: '#fcfaf9',
              borderRadius: 12,
              border: '1px solid #eee4e5',
              padding: 20,
            }}
          >
            <h3
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: '#272023',
                margin: '0 0 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Calendar size={16} color="#bd7b92" /> Lifecycle Dates
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
              <div>
                <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#887582', textTransform: 'uppercase' }}>
                  Joining / Hire Date
                </span>
                <span style={{ fontWeight: 600, color: '#272023' }}>
                  {formatDate(employee.hireDate)}
                </span>
              </div>

              <div>
                <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#887582', textTransform: 'uppercase' }}>
                  Last Working Day
                </span>
                <span style={{ color: employee.lastWorkingDay ? '#272023' : '#b5a4ac' }}>
                  {formatDate(employee.lastWorkingDay)}
                </span>
              </div>

              <div>
                <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#887582', textTransform: 'uppercase' }}>
                  Formal Exit Date
                </span>
                <span style={{ color: employee.exitDate ? '#272023' : '#b5a4ac' }}>
                  {formatDate(employee.exitDate)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Section 4: Exit Reason / Notes (if offboarding or exited) */}
        {(employee.exitReason || employee.exitNotes) && (
          <div
            style={{
              padding: '0 32px 32px',
            }}
          >
            <div
              style={{
                background: '#fff9fa',
                borderRadius: 12,
                border: '1px solid #ebd9df',
                padding: 20,
              }}
            >
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#bd7b92', margin: '0 0 12px' }}>
                Transition & Offboarding Notes
              </h3>
              {employee.exitReason && (
                <p style={{ margin: '0 0 8px', fontSize: 13, color: '#272023' }}>
                  <strong>Reason:</strong> {employee.exitReason}
                </p>
              )}
              {employee.exitNotes && (
                <p style={{ margin: 0, fontSize: 13, color: '#6e5a67', whiteSpace: 'pre-line' }}>
                  <strong>Notes:</strong> {employee.exitNotes}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Edit Employee Dialog */}
      <EditEmployeeDialog
        employee={employee}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        departments={departments}
        designations={designations}
      />

      {/* Delete Employee Dialog */}
      <DeleteEmployeeDialog
        employee={employee}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onSuccess={() => {
          setLocation('/dashboard/employees');
        }}
      />
    </div>
  );
}
