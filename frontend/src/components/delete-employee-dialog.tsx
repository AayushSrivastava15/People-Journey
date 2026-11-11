import * as React from 'react';
import { Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useDeleteEmployee } from '@/api/queries';
import { useToast } from '@/hooks/use-toast';
import type { Employee as ApiEmployee } from '@/types/api';

interface DeleteEmployeeDialogProps {
  employee: ApiEmployee | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function DeleteEmployeeDialog({
  employee,
  open,
  onOpenChange,
  onSuccess,
}: DeleteEmployeeDialogProps) {
  const { toast } = useToast();
  const deleteMutation = useDeleteEmployee();

  if (!employee) return null;

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(employee.employeeId);
      toast({
        title: 'Employee Deleted',
        description: `${employee.name} (${employee.employeeCode}) was removed from your active workspace.`,
      });
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Deletion Failed',
        description: (err as Error).message || 'Unable to delete employee record. Please try again.',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        style={{
          maxWidth: '480px',
          width: '100%',
          background: '#fffdfa',
          border: '1px solid #fecaca',
          borderRadius: '18px',
          padding: '24px 24px 20px',
          boxShadow: '0 20px 60px rgba(185,28,28,0.12)',
        }}
      >
        <DialogHeader>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 40,
                height: 40,
                borderRadius: '12px',
                background: '#fee2e2',
                color: '#dc2626',
                flexShrink: 0,
              }}
            >
              <Trash2 size={20} />
            </span>
            <div>
              <DialogTitle
                style={{
                  color: '#991b1b',
                  fontSize: '18px',
                  fontWeight: 700,
                  margin: 0,
                }}
              >
                Delete Employee Record
              </DialogTitle>
              <DialogDescription
                style={{
                  color: '#887582',
                  fontSize: '12px',
                  marginTop: '2px',
                }}
              >
                Safe workspace soft-deletion
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Employee summary card */}
          <div
            style={{
              padding: '14px 16px',
              borderRadius: '12px',
              background: '#fcf8f8',
              border: '1px solid #f3e6e6',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, color: '#3a2d36', fontSize: '15px' }}>
                {employee.name}
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '6px',
                  background: '#f4e4ea',
                  color: '#bd7b92',
                }}
              >
                {employee.employeeCode}
              </span>
            </div>

            <div style={{ fontSize: '12px', color: '#887582', display: 'flex', gap: '12px' }}>
              <span>{employee.departmentName || 'General Dept'}</span>
              <span>·</span>
              <span>{employee.designationName || 'Team Member'}</span>
              <span>·</span>
              <span>Status: {employee.status}</span>
            </div>
          </div>

          {/* Warning banner */}
          <div
            style={{
              display: 'flex',
              gap: '10px',
              padding: '12px 14px',
              borderRadius: '10px',
              background: '#fff7ed',
              border: '1px solid #fed7aa',
              fontSize: '12px',
              lineHeight: 1.5,
              color: '#9a3412',
            }}
          >
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <b>This action will soft-delete the employee.</b>
              <p style={{ margin: '4px 0 0 0', color: '#7c2d12', fontSize: '11.5px' }}>
                The employee will no longer appear in your active directory, department counts, or upcoming event notifications. Historical exit logs and audit trails will remain preserved for compliance.
              </p>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            marginTop: '20px',
            paddingTop: '16px',
            borderTop: '1px solid #f3e6e6',
          }}
        >
          <button
            type="button"
            disabled={deleteMutation.isPending}
            onClick={() => onOpenChange(false)}
            style={{
              padding: '9px 16px',
              borderRadius: '8px',
              border: '1px solid #eee3e2',
              background: '#fffdfa',
              color: '#58404c',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.15s ease',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={deleteMutation.isPending}
            onClick={handleDelete}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '9px 18px',
              borderRadius: '8px',
              border: 'none',
              background: '#dc2626',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 600,
              cursor: deleteMutation.isPending ? 'not-allowed' : 'pointer',
              opacity: deleteMutation.isPending ? 0.7 : 1,
              transition: 'all 0.15s ease',
            }}
          >
            {deleteMutation.isPending ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Deleting…
              </>
            ) : (
              <>
                <Trash2 size={14} />
                Confirm Deletion
              </>
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
