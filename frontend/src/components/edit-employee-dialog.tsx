import * as React from 'react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, Loader2, Pencil, AlertTriangle, UserCheck, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AnimatedSelect } from '@/components/ui/animated-select';
import { DatePicker } from '@/components/ui/date-picker';
import { useUpdateEmployee } from '@/api/queries';
import { useToast } from '@/hooks/use-toast';
import type { Employee as ApiEmployee, Department, Designation } from '@/types/api';

// ---------------------------------------------------------------------------
// Zod schema for the edit form
// ---------------------------------------------------------------------------
const editEmployeeSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(100),
  lastName: z.string().trim().max(100).optional().default(''),
  workEmail: z.union([z.string().trim().email('Invalid email format'), z.literal('')]).optional(),
  personalEmail: z.union([z.string().trim().email('Invalid email format'), z.literal('')]).optional(),
  phone: z.string().trim().max(30).optional().default(''),
  departmentId: z.coerce.number().int().positive().optional().nullable(),
  designationId: z.coerce.number().int().positive().optional().nullable(),
  employmentStatus: z.enum(['Active', 'Onboarding', 'Offboarding', 'Exited']),
  hireDate: z.string().min(1, 'Joining date is required'),
  lastWorkingDay: z.string().optional(),
  exitDate: z.string().optional(),
  exitReason: z.string().optional(),
  exitNotes: z.string().optional(),
});

type EditEmployeeFormValues = z.infer<typeof editEmployeeSchema>;

// ---------------------------------------------------------------------------
// Lifecycle transition rules
// ---------------------------------------------------------------------------
type LifecycleStatus = 'Active' | 'Onboarding' | 'Offboarding' | 'Exited';

const ALLOWED_TRANSITIONS: Record<LifecycleStatus, LifecycleStatus[]> = {
  Onboarding: ['Onboarding', 'Active', 'Exited'],
  Active: ['Active', 'Offboarding', 'Exited'],
  Offboarding: ['Offboarding', 'Active', 'Exited'],
  Exited: ['Exited'],
};

// Transitions that require a confirmation dialog
const SENSITIVE_TRANSITIONS: Partial<Record<string, { title: string; description: string; confirmLabel: string }>> = {
  'Active→Offboarding': {
    title: 'Initiate Employee Exit',
    description: 'You are about to move this employee to Offboarding status. This will begin the exit workflow. Make sure to enter a planned last working day.',
    confirmLabel: 'Confirm Offboarding',
  },
  'Offboarding→Active': {
    title: 'Cancel Exit Process',
    description: "You are cancelling this employee's exit process and returning them to Active status. Any pending exit tasks will remain but the offboarding workflow will be suspended.",
    confirmLabel: 'Cancel Exit & Reactivate',
  },
  'Offboarding→Exited': {
    title: 'Complete Employee Exit',
    description: "You are marking this employee's exit as complete. This action confirms the employee has fully exited the organization.",
    confirmLabel: 'Mark as Exited',
  },
  'Active→Exited': {
    title: 'Mark Employee as Exited',
    description: 'You are directly marking this employee as Exited, bypassing the Offboarding workflow. Confirm this is intentional.',
    confirmLabel: 'Mark as Exited',
  },
  'Onboarding→Active': {
    title: 'Complete Onboarding',
    description: 'Confirm that onboarding is complete and move this employee to Active status.',
    confirmLabel: 'Mark as Active',
  },
};

// ---------------------------------------------------------------------------
// Helper: map backend status strings to frontend casing
// ---------------------------------------------------------------------------
function toDisplayStatus(raw: string): LifecycleStatus {
  switch (raw.toUpperCase()) {
    case 'ACTIVE': return 'Active';
    case 'ONBOARDING': return 'Onboarding';
    case 'OFFBOARDING': return 'Offboarding';
    case 'EXITED': return 'Exited';
    default: return 'Active';
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface EditEmployeeDialogProps {
  employee: ApiEmployee | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departments: Department[];
  designations: Designation[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function EditEmployeeDialog({
  employee,
  open,
  onOpenChange,
  departments,
  designations,
}: EditEmployeeDialogProps) {
  const updateMutation = useUpdateEmployee();
  const { toast } = useToast();

  // Pending transition confirmation
  const [pendingTransition, setPendingTransition] = useState<{
    key: string;
    newStatus: LifecycleStatus;
    formValues: EditEmployeeFormValues;
  } | null>(null);

  const currentStatus: LifecycleStatus = employee
    ? toDisplayStatus(employee.employmentStatus)
    : 'Active';

  const form = useForm<EditEmployeeFormValues>({
    resolver: zodResolver(editEmployeeSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      workEmail: '',
      personalEmail: '',
      phone: '',
      departmentId: null,
      designationId: null,
      employmentStatus: 'Active',
      hireDate: '',
      lastWorkingDay: '',
      exitDate: '',
      exitReason: '',
      exitNotes: '',
    },
  });

  // Populate form when employee changes
  useEffect(() => {
    if (!employee || !open) return;
    form.reset({
      firstName: employee.firstName || '',
      lastName: employee.lastName || '',
      workEmail: employee.workEmail || '',
      personalEmail: employee.personalEmail || '',
      phone: employee.phone || '',
      departmentId: employee.departmentId ?? null,
      designationId: employee.designationId ?? null,
      employmentStatus: toDisplayStatus(employee.employmentStatus),
      hireDate: employee.hireDate || '',
      lastWorkingDay: employee.lastWorkingDay || '',
      exitDate: employee.exitDate || '',
      exitReason: employee.exitReason || '',
      exitNotes: employee.exitNotes || '',
    });
  }, [employee, open, form]);

  const watchedStatus = form.watch('employmentStatus') as LifecycleStatus;
  const watchedHireDate = form.watch('hireDate');
  const watchedExitDate = form.watch('exitDate');
  const watchedLastWorkingDay = form.watch('lastWorkingDay');

  const allowedStatuses = ALLOWED_TRANSITIONS[currentStatus] || [currentStatus];

  // ----- Submit handler -----
  const onSubmit = (values: EditEmployeeFormValues) => {
    if (!employee) return;
    const todayStr = new Date().toISOString().slice(0, 10);
    const newStatus = values.employmentStatus as LifecycleStatus;

    // Cross-field validations by lifecycle status
    if (newStatus === 'Active' && values.hireDate && values.hireDate > todayStr) {
      form.setError('hireDate', { message: 'Joining date for active employees cannot be in the future.' });
      return;
    }

    if (newStatus === 'Offboarding') {
      const lwd = values.lastWorkingDay || values.exitDate;
      if (!lwd) {
        form.setError('lastWorkingDay', { message: 'Last working day is required for offboarding.' });
        return;
      }
      if (values.hireDate && lwd < values.hireDate) {
        form.setError('lastWorkingDay', { message: 'Last working day cannot precede joining date.' });
        return;
      }
    }

    if (newStatus === 'Exited') {
      const actualExit = values.exitDate || values.lastWorkingDay;
      if (!actualExit) {
        form.setError('exitDate', { message: 'Exit date is required for exited employees.' });
        return;
      }
      if (values.hireDate && actualExit < values.hireDate) {
        form.setError('exitDate', { message: 'Exit date cannot precede joining date.' });
        return;
      }
    }

    const transKey = `${currentStatus}→${newStatus}`;

    // Check if transition is sensitive
    if (newStatus !== currentStatus && SENSITIVE_TRANSITIONS[transKey]) {
      setPendingTransition({ key: transKey, newStatus, formValues: values });
      return;
    }

    executeUpdate(values);
  };

  const executeUpdate = async (values: EditEmployeeFormValues) => {
    if (!employee) return;
    try {
      const lwd = values.employmentStatus === 'Offboarding' ? (values.lastWorkingDay || values.exitDate || null) : null;
      const exDate = values.employmentStatus === 'Exited' ? (values.exitDate || values.lastWorkingDay || null) : (values.employmentStatus === 'Offboarding' ? lwd : null);

      await updateMutation.mutateAsync({
        employeeId: employee.employeeId,
        payload: {
          firstName: values.firstName,
          lastName: values.lastName || '',
          workEmail: values.workEmail || undefined,
          personalEmail: values.personalEmail || undefined,
          phone: values.phone || undefined,
          departmentId: values.departmentId ?? null,
          designationId: values.designationId ?? null,
          employmentStatus: values.employmentStatus,
          hireDate: values.hireDate,
          lastWorkingDay: lwd,
          exitDate: exDate,
          exitReason: (values.employmentStatus === 'Offboarding' || values.employmentStatus === 'Exited') ? (values.exitReason || null) : null,
          exitNotes: (values.employmentStatus === 'Offboarding' || values.employmentStatus === 'Exited') ? (values.exitNotes || null) : null,
        },
      });

      const displayName = `${values.firstName} ${values.lastName || ''}`.trim();
      toast({
        title: 'Employee Updated',
        description: `${displayName}'s record has been saved successfully.`,
      });
      onOpenChange(false);
      setPendingTransition(null);
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: (err as Error).message || 'An error occurred while saving the employee record.',
      });
    }
  };

  const handleConfirmTransition = () => {
    if (pendingTransition) {
      executeUpdate(pendingTransition.formValues);
    }
  };

  const handleCancelDialog = () => {
    onOpenChange(false);
  };

  if (!employee) return null;

  const transitionInfo = pendingTransition ? SENSITIVE_TRANSITIONS[pendingTransition.key] : null;

  return (
    <>
      {/* ---- Edit Dialog ---- */}
      <Dialog open={open && !pendingTransition} onOpenChange={(o) => { if (!o) handleCancelDialog(); }}>
        <DialogContent
          onPointerDownOutside={e => {
            const target = e.target as HTMLElement;
            if (target?.closest?.('.animated-select-container') || target?.closest?.('[role="listbox"]')) {
              e.preventDefault();
            }
          }}
          onInteractOutside={e => {
            const target = e.target as HTMLElement;
            if (target?.closest?.('.animated-select-container') || target?.closest?.('[role="listbox"]')) {
              e.preventDefault();
            }
          }}
          style={{
            maxWidth: '640px',
            width: '100%',
            background: '#fffdfa',
            border: '1px solid #eee3e2',
            borderRadius: '18px',
            padding: '28px 28px 24px',
            boxShadow: '0 20px 60px rgba(88,64,76,0.14)',
          }}
        >
          <DialogHeader style={{ marginBottom: '4px' }}>
            <DialogTitle style={{ display: 'flex', alignItems: 'center', gap: '9px', color: '#3a2d36', fontSize: '17px', fontWeight: 700 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 34, height: 34, borderRadius: '10px',
                background: 'linear-gradient(135deg,#f4e4ea,#eedde7)',
                color: '#bd7b92', flexShrink: 0,
              }}>
                <Pencil size={16} />
              </span>
              Edit Employee
            </DialogTitle>
            <DialogDescription style={{ color: '#887582', fontSize: '12px', marginTop: '2px' }}>
              {employee.name} · {employee.employeeCode}
            </DialogDescription>
          </DialogHeader>

          <form
            autoComplete="off"
            onSubmit={form.handleSubmit(onSubmit)}
            style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}
          >
            {/* ---- Name row ---- */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div className="form-field">
                <div className="field-label-row">
                  <label htmlFor="edit-firstName">First name <span style={{ color: '#c0556b' }}>*</span></label>
                </div>
                <input
                  id="edit-firstName"
                  {...form.register('firstName')}
                  placeholder="e.g. Avery"
                />
                {form.formState.errors.firstName && (
                  <span className="field-error" style={{ fontSize: '11px' }}>{form.formState.errors.firstName.message}</span>
                )}
              </div>

              <div className="form-field">
                <div className="field-label-row">
                  <label htmlFor="edit-lastName">Last name</label>
                  <span className="field-hint">Optional</span>
                </div>
                <input
                  id="edit-lastName"
                  {...form.register('lastName')}
                  placeholder="e.g. Morgan"
                />
              </div>
            </div>

            {/* ---- Contact row ---- */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div className="form-field">
                <div className="field-label-row">
                  <label htmlFor="edit-workEmail">Work email</label>
                  <span className="field-hint">Required</span>
                </div>
                <input
                  id="edit-workEmail"
                  {...form.register('workEmail')}
                  type="email"
                  placeholder="name@company.com"
                />
                {form.formState.errors.workEmail && (
                  <span className="field-error" style={{ fontSize: '11px' }}>{form.formState.errors.workEmail.message}</span>
                )}
              </div>

              <div className="form-field">
                <div className="field-label-row">
                  <label htmlFor="edit-personalEmail">Personal email</label>
                  <span className="field-hint">Optional</span>
                </div>
                <input
                  id="edit-personalEmail"
                  {...form.register('personalEmail')}
                  type="email"
                  placeholder="name@gmail.com"
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div className="form-field">
                <div className="field-label-row">
                  <label htmlFor="edit-phone">Phone number</label>
                  <span className="field-hint">Optional</span>
                </div>
                <input
                  id="edit-phone"
                  {...form.register('phone')}
                  type="tel"
                  placeholder="+91 98765 43210"
                />
              </div>

              <div className="form-field">
                <div className="field-label-row">
                  <label htmlFor="edit-status">Lifecycle status</label>
                </div>
                <AnimatedSelect
                  id="edit-status"
                  variant="form"
                  value={watchedStatus}
                  onChange={(val) => form.setValue('employmentStatus', val as LifecycleStatus, { shouldDirty: true })}
                  options={[
                    { value: 'Onboarding', label: 'Onboarding', subtext: 'Beginning onboarding journey' },
                    { value: 'Active', label: 'Active', subtext: 'Fully active team member' },
                    { value: 'Offboarding', label: 'Offboarding', subtext: 'Planned transition or exit' },
                    { value: 'Exited', label: 'Exited', subtext: 'Former employee' },
                  ].filter(opt => allowedStatuses.includes(opt.value as LifecycleStatus))}
                />
              </div>
            </div>

            {watchedStatus !== currentStatus && (
              <span style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                fontSize: '11px', color: '#b06b20', marginTop: '-4px', marginBottom: '8px'
              }}>
                <AlertTriangle size={13} /> Transitioning status from <b>{currentStatus}</b> to <b>{watchedStatus}</b>
              </span>
            )}

            {/* ---- Department & Designation ---- */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div className="form-field">
                <div className="field-label-row">
                  <label htmlFor="edit-department">Department</label>
                </div>
                <AnimatedSelect
                  id="edit-department"
                  variant="form"
                  placeholder="Select department"
                  value={
                    departments.find(d => d.departmentId === form.watch('departmentId'))?.departmentName || ''
                  }
                  onChange={(val) => {
                    const dept = departments.find(d => d.departmentName === val);
                    form.setValue('departmentId', dept?.departmentId ?? null, { shouldDirty: true });
                  }}
                  options={[
                    { value: '', label: '— None —' },
                    ...departments.map(d => ({ value: d.departmentName, label: d.departmentName })),
                  ]}
                />
              </div>

              <div className="form-field">
                <div className="field-label-row">
                  <label htmlFor="edit-designation">Designation / Role</label>
                </div>
                <AnimatedSelect
                  id="edit-designation"
                  variant="form"
                  placeholder="Select designation"
                  value={
                    designations.find(d => d.designationId === form.watch('designationId'))?.designationName || ''
                  }
                  onChange={(val) => {
                    const desig = designations.find(d => d.designationName === val);
                    form.setValue('designationId', desig?.designationId ?? null, { shouldDirty: true });
                  }}
                  options={[
                    { value: '', label: '— None —' },
                    ...designations.map(d => ({ value: d.designationName, label: d.designationName })),
                  ]}
                />
              </div>
            </div>

            {/* ---- Dynamic Lifecycle Dates & Details ---- */}
            <div style={{ display: 'grid', gridTemplateColumns: (watchedStatus === 'Offboarding' || watchedStatus === 'Exited') ? '1fr 1fr' : '1fr', gap: '14px' }}>
              <div className="form-field">
                <div className="field-label-row">
                  <label htmlFor="edit-hireDate">Joining date <span style={{ color: '#c0556b' }}>*</span></label>
                  {watchedStatus === 'Active' && <span className="field-hint">Past or today</span>}
                  {watchedStatus === 'Onboarding' && <span className="field-hint">Today or future</span>}
                </div>
                <DatePicker
                  id="edit-hireDate"
                  value={form.watch('hireDate')}
                  onChange={(val) => form.setValue('hireDate', val, { shouldValidate: true, shouldDirty: true })}
                  placeholder="Select joining date"
                  required
                />
                {form.formState.errors.hireDate && (
                  <span className="field-error" style={{ fontSize: '11px' }}>{form.formState.errors.hireDate.message}</span>
                )}
              </div>

              {watchedStatus === 'Offboarding' && (
                <div className="form-field">
                  <div className="field-label-row">
                    <label htmlFor="edit-lastWorkingDay">Scheduled Last Working Day <span style={{ color: '#c0556b' }}>*</span></label>
                    <span className="field-hint">Today or future</span>
                  </div>
                  <DatePicker
                    id="edit-lastWorkingDay"
                    value={form.watch('lastWorkingDay') || form.watch('exitDate') || ''}
                    onChange={(val) => {
                      form.setValue('lastWorkingDay', val || '', { shouldDirty: true });
                      form.setValue('exitDate', val || '', { shouldDirty: true });
                    }}
                    placeholder="Select scheduled last working day"
                    required
                  />
                  {form.formState.errors.lastWorkingDay && (
                    <span className="field-error" style={{ fontSize: '11px' }}>
                      {form.formState.errors.lastWorkingDay.message}
                    </span>
                  )}
                </div>
              )}

              {watchedStatus === 'Exited' && (
                <div className="form-field">
                  <div className="field-label-row">
                    <label htmlFor="edit-exitDate">Recorded Exit Date <span style={{ color: '#c0556b' }}>*</span></label>
                    <span className="field-hint">Past or today</span>
                  </div>
                  <DatePicker
                    id="edit-exitDate"
                    value={form.watch('exitDate') || form.watch('lastWorkingDay') || ''}
                    onChange={(val) => {
                      form.setValue('exitDate', val || '', { shouldDirty: true });
                      form.setValue('lastWorkingDay', val || '', { shouldDirty: true });
                    }}
                    placeholder="Select recorded exit date"
                    required
                  />
                  {form.formState.errors.exitDate && (
                    <span className="field-error" style={{ fontSize: '11px' }}>
                      {form.formState.errors.exitDate.message}
                    </span>
                  )}
                </div>
              )}
            </div>

            {(watchedStatus === 'Offboarding' || watchedStatus === 'Exited') && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '14px' }}>
                <div className="form-field">
                  <div className="field-label-row">
                    <label htmlFor="edit-exitReason">Reason for Departure</label>
                    <span className="field-hint">Optional</span>
                  </div>
                  <AnimatedSelect
                    id="edit-exitReason"
                    variant="form"
                    placeholder="Select reason"
                    value={form.watch('exitReason') || ''}
                    onChange={(val) => form.setValue('exitReason', val, { shouldDirty: true })}
                    options={[
                      { value: 'Better career opportunity', label: 'Better career opportunity' },
                      { value: 'Personal reasons', label: 'Personal reasons' },
                      { value: 'Relocation', label: 'Relocation' },
                      { value: 'Higher studies', label: 'Higher studies' },
                      { value: 'Compensation & benefits', label: 'Compensation & benefits' },
                      { value: 'Health & medical', label: 'Health & medical' },
                      { value: 'Career change', label: 'Career change' },
                      { value: 'Retirement', label: 'Retirement' },
                      { value: 'Other', label: 'Other' },
                    ]}
                  />
                </div>

                <div className="form-field">
                  <div className="field-label-row">
                    <label htmlFor="edit-exitNotes">{watchedStatus === 'Offboarding' ? 'Handover & Transition Notes' : 'Historical Archival Notes'}</label>
                    <span className="field-hint">Optional</span>
                  </div>
                  <textarea
                    id="edit-exitNotes"
                    {...form.register('exitNotes')}
                    placeholder="Notes regarding transition, asset handovers, or relieving..."
                    rows={2}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1px solid #dcd1d7',
                      fontSize: '0.84rem',
                    }}
                  />
                </div>
              </div>
            )}

            {/* ---- Global errors ---- */}
            {Object.keys(form.formState.errors).length > 0 && (
              <p className="field-error" role="alert" style={{ marginTop: '-4px', fontSize: '12px' }}>
                Please fix the highlighted fields before saving.
              </p>
            )}

            {/* ---- Actions ---- */}
            <div style={{ display: 'flex', gap: '10px', paddingTop: '6px', justifyContent: 'flex-end', borderTop: '1px solid #f3eaea', marginTop: '4px' }}>
              <button
                type="button"
                className="secondary-action"
                onClick={handleCancelDialog}
                disabled={updateMutation.isPending}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="primary-action"
                disabled={updateMutation.isPending || !form.formState.isDirty}
              >
                {updateMutation.isPending ? (
                  <><Loader2 size={15} className="animate-spin" /> Saving…</>
                ) : (
                  <><Check size={15} /> Save Changes</>
                )}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ---- Transition Confirmation AlertDialog ---- */}
      <AlertDialog open={!!pendingTransition} onOpenChange={(o) => { if (!o) setPendingTransition(null); }}>
        <AlertDialogContent style={{ borderRadius: '16px', background: '#fffdfa', border: '1px solid #eee3e2' }}>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: '#3a2d36', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 32, height: 32, borderRadius: '9px',
                background: 'linear-gradient(135deg,#fdf0e6,#fbdfc8)',
                color: '#c07040', flexShrink: 0,
              }}>
                <AlertTriangle size={15} />
              </span>
              {transitionInfo?.title}
            </AlertDialogTitle>
            <AlertDialogDescription style={{ color: '#6b5a63', fontSize: '13px', lineHeight: '1.65', paddingLeft: '40px' }}>
              {transitionInfo?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter style={{ marginTop: '8px' }}>
            <AlertDialogCancel
              onClick={() => setPendingTransition(null)}
              style={{ borderRadius: '9px', fontSize: '13px' }}
            >
              Go back
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmTransition}
              disabled={updateMutation.isPending}
              style={{
                borderRadius: '9px', fontSize: '13px',
                background: 'linear-gradient(135deg,#c4455c,#a83252)',
                border: 'none', color: '#fff', display: 'flex', alignItems: 'center', gap: '5px',
              }}
            >
              {updateMutation.isPending ? (
                <><Loader2 size={13} className="animate-spin" /> Saving…</>
              ) : (
                <><UserCheck size={13} /> {transitionInfo?.confirmLabel}</>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
