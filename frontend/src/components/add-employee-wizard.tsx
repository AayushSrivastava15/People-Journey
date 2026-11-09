import * as React from 'react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UserPlus,
  UserCheck,
  LogOut,
  UserMinus,
  ArrowRight,
  ArrowLeft,
  Check,
  Loader2,
  Mail,
  AlertCircle,
  FileText,
  Calendar,
  Briefcase,
  Building2,
  Shield,
  ClipboardList,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { useCreateEmployee } from '@/api/queries';
import { useToast } from '@/hooks/use-toast';
import { AnimatedSelect } from '@/components/ui/animated-select';
import { DatePicker } from '@/components/ui/date-picker';
import { EmailPreparationDialog } from '@/components/email-preparation-dialog';
import type { Department, Designation, Employee } from '@/types/api';

export type LifecycleStage = 'ONBOARDING' | 'ACTIVE' | 'OFFBOARDING' | 'EXITED';

interface AddEmployeeWizardProps {
  departments: Department[];
  designations: Designation[];
  onEmployeeCreated?: (employee: Employee) => void;
}

const DEPARTURE_REASONS = [
  'Better career opportunity',
  'Personal reasons',
  'Relocation',
  'Higher studies',
  'Compensation & benefits',
  'Health & medical',
  'Career change',
  'Retirement',
  'End of contract',
  'Other',
];

const OFFBOARDING_CHECKLIST_ITEMS = [
  'Knowledge transfer & project handover documentation',
  'Asset return (laptop, phone, security badge, keys)',
  'IT access revocation & email account suspension',
  'Confidential exit interview invitation & survey',
  'Final payroll calculation & leave encashment',
  'Relieving letter & experience certificate generation',
  'Departmental clearance sign-offs',
  'Post-exit contact details verification',
];

const STAGES_CONFIG: Array<{
  id: LifecycleStage;
  title: string;
  badge: string;
  tagline: string;
  icon: typeof UserPlus;
  iconBg: string;
  iconColor: string;
  highlights: string[];
}> = [
  {
    id: 'ONBOARDING',
    title: 'Onboarding',
    badge: 'Pre-hire & Joining',
    tagline: 'Incoming talent joining your organization.',
    icon: UserPlus,
    iconBg: 'rgba(181, 121, 142, 0.14)',
    iconColor: '#944b63',
    highlights: [
      'Welcome comms & portal invitation',
      'Joining logistics & orientation roadmap',
      'Document collection & compliance checks',
    ],
  },
  {
    id: 'ACTIVE',
    title: 'Active',
    badge: 'Current Staff',
    tagline: 'Confirmed team member currently active.',
    icon: UserCheck,
    iconBg: 'rgba(40, 167, 69, 0.12)',
    iconColor: '#28a745',
    highlights: [
      'Department & role assignment',
      'Published to organization directory',
      'Tenure, service & journey milestones',
    ],
  },
  {
    id: 'OFFBOARDING',
    title: 'Offboarding',
    badge: 'In Transition',
    tagline: 'Departing employee preparing for transition.',
    icon: LogOut,
    iconBg: 'rgba(235, 130, 60, 0.12)',
    iconColor: '#d96e2b',
    highlights: [
      'Scheduled last working day & handovers',
      'Asset return & IT access wrap-up',
      'Confidential exit survey invitation',
    ],
  },
  {
    id: 'EXITED',
    title: 'Exited',
    badge: 'Alumni Record',
    tagline: 'Alumni member with completed service.',
    icon: UserMinus,
    iconBg: 'rgba(108, 117, 125, 0.12)',
    iconColor: '#6c757d',
    highlights: [
      'Verified exit date & relieving record',
      'Historical personnel & headcount archive',
      'Post-employment verification ready',
    ],
  },
];

export function AddEmployeeWizard({
  departments,
  designations,
  onEmployeeCreated,
}: AddEmployeeWizardProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedStage, setSelectedStage] = useState<LifecycleStage>('ONBOARDING');
  const [createdEmployee, setCreatedEmployee] = useState<Employee | null>(null);
  const [showEmailDialog, setShowEmailDialog] = useState(false);

  const createMutation = useCreateEmployee();
  const { toast } = useToast();

  const defaultDepartments = ['Engineering', 'Design', 'Product', 'People', 'Operations', 'Finance', 'Marketing'];
  const deptList = departments && departments.length > 0
    ? departments.map(d => d.departmentName)
    : defaultDepartments;

  // Dynamic form state
  const [fullName, setFullName] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [workEmail, setWorkEmail] = useState('');
  const [personalEmail, setPersonalEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [department, setDepartment] = useState('');
  const [designation, setDesignation] = useState('');
  const [joiningDate, setJoiningDate] = useState('');
  const [lastWorkingDay, setLastWorkingDay] = useState('');
  const [exitDate, setExitDate] = useState('');
  const [exitReason, setExitReason] = useState('');
  const [exitNotes, setExitNotes] = useState('');

  // Form error messages
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleStageSelect = (stage: LifecycleStage) => {
    setSelectedStage(stage);
    // Reset stage-specific fields to avoid dirty states
    setLastWorkingDay('');
    setExitDate('');
    setExitReason('');
    setExitNotes('');
    setErrors({});
  };

  const handleProceedToStep2 = () => {
    setStep(2);
  };

  const handleBackToStep1 = () => {
    setStep(1);
    setErrors({});
  };

  const validateForm = (): boolean => {
    const errs: Record<string, string> = {};
    const todayStr = new Date().toISOString().slice(0, 10);

    // Common validations
    if (!fullName.trim()) {
      errs.fullName = 'Full name is required.';
    }

    if (!workEmail.trim()) {
      errs.workEmail = 'Work email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(workEmail.trim())) {
      errs.workEmail = 'Please provide a valid work email address.';
    }

    if (personalEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personalEmail.trim())) {
      errs.personalEmail = 'Please provide a valid personal email address.';
    }

    if (!department) {
      errs.department = 'Department is required.';
    }

    if (!joiningDate) {
      errs.joiningDate = 'Joining date is required.';
    }

    // Stage-specific date validations
    if (joiningDate) {
      if (selectedStage === 'ONBOARDING') {
        // Onboarding: Joining date may be today or a future date
        if (joiningDate < todayStr) {
          errs.joiningDate = 'Joining date for onboarding employees must be today or a future date.';
        }
      } else if (selectedStage === 'ACTIVE') {
        // Active: Joining date may be past or today, cannot be future
        if (joiningDate > todayStr) {
          errs.joiningDate = 'Joining date for active employees cannot be in the future. For future joiners, choose Onboarding.';
        }
      } else if (selectedStage === 'OFFBOARDING') {
        if (!lastWorkingDay) {
          errs.lastWorkingDay = 'Last working day is required for offboarding employees.';
        } else {
          if (lastWorkingDay < todayStr) {
            errs.lastWorkingDay = 'Last working day must be today or a future date. For past exits, select Exited.';
          }
          if (lastWorkingDay < joiningDate) {
            errs.lastWorkingDay = 'Last working day cannot precede the joining date.';
          }
        }
      } else if (selectedStage === 'EXITED') {
        if (!exitDate) {
          errs.exitDate = 'Exit date is required for exited employees.';
        } else {
          if (exitDate > todayStr) {
            errs.exitDate = 'Exit date must be today or in the past. For upcoming exits, choose Offboarding.';
          }
          if (exitDate < joiningDate) {
            errs.exitDate = 'Exit date cannot precede the joining date.';
          }
        }
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      const parts = fullName.trim().split(/\s+/);
      const firstName = parts[0] || 'Unknown';
      const lastName = parts.slice(1).join(' ') || '';

      const created = await createMutation.mutateAsync({
        employeeCode: employeeCode.trim() || undefined,
        firstName,
        lastName,
        fullName: fullName.trim(),
        workEmail: workEmail.trim() || undefined,
        personalEmail: personalEmail.trim() || undefined,
        phone: phone.trim() || undefined,
        department,
        designation: designation.trim() || undefined,
        hireDate: joiningDate,
        joiningDate,
        employmentStatus: selectedStage,
        lastWorkingDay: selectedStage === 'OFFBOARDING' ? lastWorkingDay : undefined,
        exitDate: selectedStage === 'EXITED' ? exitDate : (selectedStage === 'OFFBOARDING' ? lastWorkingDay : undefined),
        exitReason: (selectedStage === 'OFFBOARDING' || selectedStage === 'EXITED') ? exitReason : undefined,
        exitNotes: (selectedStage === 'OFFBOARDING' || selectedStage === 'EXITED') ? exitNotes : undefined,
      });

      toast({
        title: 'Employee Added Successfully',
        description: `${created.name} has been enrolled as ${selectedStage.toLowerCase()} in your workspace.`,
      });

      setCreatedEmployee(created);
      if (onEmployeeCreated) {
        onEmployeeCreated(created);
      }
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Failed to Save Employee',
        description: (err as Error).message || 'An error occurred while saving the employee.',
      });
    }
  };

  const handleResetWizard = () => {
    setFullName('');
    setEmployeeCode('');
    setWorkEmail('');
    setPersonalEmail('');
    setPhone('');
    setDepartment('');
    setDesignation('');
    setJoiningDate('');
    setLastWorkingDay('');
    setExitDate('');
    setExitReason('');
    setExitNotes('');
    setErrors({});
    setCreatedEmployee(null);
    setStep(1);
    setSelectedStage('ONBOARDING');
  };

  // Helper for recommended template label
  const getRecommendedTemplateInfo = () => {
    switch (selectedStage) {
      case 'ONBOARDING':
        return {
          name: 'Employee Onboarding / Welcome Email',
          category: 'onboarding',
          desc: 'Share reporting details, onboarding roadmap, and team welcome with the new hire.',
        };
      case 'ACTIVE':
        return {
          name: 'Active Employee / Employment Confirmation',
          category: 'lifecycle',
          desc: 'Send formal placement confirmation or verify ongoing team assignment.',
        };
      case 'OFFBOARDING':
        return {
          name: 'Employee Offboarding Notification',
          category: 'offboarding',
          desc: 'Coordinate handover documentation, asset return schedule, and final working day formalities.',
        };
      case 'EXITED':
        return {
          name: 'Employee Exit Confirmation',
          category: 'offboarding',
          desc: 'Provide formal relieving notice and post-employment verification information.',
        };
    }
  };

  // If successfully created, display the success overview
  if (createdEmployee) {
    const templateInfo = getRecommendedTemplateInfo();
    return (
      <div className="form-preview-layout">
        <motion.section
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="panel"
          style={{ padding: '32px', maxWidth: '720px', margin: '0 auto', width: '100%' }}
        >
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                backgroundColor: 'rgba(40, 167, 69, 0.12)',
                color: '#28a745',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '12px',
              }}
            >
              <CheckCircle2 size={32} />
            </div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 600, color: '#2c1b22', margin: '0 0 6px 0' }}>
              Employee Record Created
            </h2>
            <p style={{ fontSize: '0.9rem', color: '#685860', margin: 0 }}>
              {createdEmployee.name} is now registered in your workspace under <b>{createdEmployee.status}</b> stage.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '14px',
              padding: '20px',
              borderRadius: '14px',
              backgroundColor: '#faf6f8',
              border: '1px solid rgba(181, 121, 142, 0.18)',
              marginBottom: '24px',
            }}
          >
            <div>
              <span style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: '#8c7781', fontWeight: 600 }}>Employee Code</span>
              <p style={{ margin: '3px 0 0 0', fontWeight: 600, color: '#2c1b22' }}>{createdEmployee.employeeCode}</p>
            </div>
            <div>
              <span style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: '#8c7781', fontWeight: 600 }}>Official Email</span>
              <p style={{ margin: '3px 0 0 0', fontWeight: 600, color: '#2c1b22' }}>{createdEmployee.workEmail || '—'}</p>
            </div>
            <div>
              <span style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: '#8c7781', fontWeight: 600 }}>Department & Role</span>
              <p style={{ margin: '3px 0 0 0', color: '#49373f' }}>
                {createdEmployee.departmentName || 'General'} {createdEmployee.designationName ? `• ${createdEmployee.designationName}` : ''}
              </p>
            </div>
            <div>
              <span style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: '#8c7781', fontWeight: 600 }}>Joining Date</span>
              <p style={{ margin: '3px 0 0 0', color: '#49373f' }}>{createdEmployee.hireDate}</p>
            </div>
            {createdEmployee.lastWorkingDay && (
              <div>
                <span style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: '#8c7781', fontWeight: 600 }}>Last Working Day</span>
                <p style={{ margin: '3px 0 0 0', color: '#944b63', fontWeight: 600 }}>{createdEmployee.lastWorkingDay}</p>
              </div>
            )}
            {createdEmployee.exitDate && (
              <div>
                <span style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: '#8c7781', fontWeight: 600 }}>Exit Date</span>
                <p style={{ margin: '3px 0 0 0', color: '#944b63', fontWeight: 600 }}>{createdEmployee.exitDate}</p>
              </div>
            )}
          </div>

          {/* Recommended Communication Box */}
          <div
            style={{
              padding: '16px 20px',
              borderRadius: '14px',
              backgroundColor: 'rgba(181, 121, 142, 0.08)',
              border: '1px solid rgba(181, 121, 142, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              marginBottom: '24px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, backgroundColor: '#944b63', color: '#ffffff', padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>
                  Recommended Action
                </span>
                <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#2c1b22' }}>{templateInfo.name}</span>
              </div>
              <p style={{ margin: 0, fontSize: '0.82rem', color: '#685860' }}>{templateInfo.desc}</p>
            </div>

            <button
              type="button"
              onClick={() => setShowEmailDialog(true)}
              className="primary-action"
              style={{ whiteSpace: 'nowrap', padding: '8px 16px', fontSize: '0.84rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Mail size={15} /> Prepare Draft
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
            <button
              type="button"
              onClick={handleResetWizard}
              className="secondary-action"
              style={{ padding: '8px 20px', fontSize: '0.86rem' }}
            >
              <UserPlus size={15} /> Add Another Employee
            </button>
            <a
              href="/dashboard/employees"
              className="secondary-action"
              style={{ padding: '8px 20px', fontSize: '0.86rem', textDecoration: 'none' }}
            >
              View All Employees
            </a>
          </div>
        </motion.section>

        {/* Email preparation dialog */}
        <EmailPreparationDialog
          isOpen={showEmailDialog}
          onClose={() => setShowEmailDialog(false)}
          initialEmployeeId={createdEmployee.employeeId}
          initialCategory={templateInfo.category}
        />
      </div>
    );
  }

  return (
    <div className="add-employee-wizard" style={{ maxWidth: '1240px', margin: '0 auto', width: '100%' }}>
      {/* Step Indicator Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          marginBottom: '16px',
          paddingBottom: '14px',
          borderBottom: '1px solid rgba(181, 121, 142, 0.14)',
        }}
      >
        <div>
          <span
            style={{
              fontSize: '0.72rem',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: '#944b63',
              fontWeight: 700,
              backgroundColor: 'rgba(181, 121, 142, 0.1)',
              padding: '2px 8px',
              borderRadius: '4px',
              display: 'inline-block',
              marginBottom: '4px',
            }}
          >
            Step {step} of 2 · {step === 1 ? 'Lifecycle Stage' : 'Employee Details'}
          </span>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 600, color: '#2c1b22', margin: '2px 0 0 0' }}>
            {step === 1 ? 'Choose Lifecycle Stage' : `Employee Details (${selectedStage})`}
          </h2>
          <p style={{ fontSize: '0.84rem', color: '#685860', margin: '2px 0 0 0' }}>
            {step === 1
              ? "Select where this team member is in their journey. We'll automatically adapt required fields, compliance touchpoints, and email triggers."
              : `Fill in the details for the employee in ${selectedStage.toLowerCase()} stage.`}
          </p>
        </div>

        {step === 1 ? (
          <button
            type="button"
            onClick={handleProceedToStep2}
            className="primary-action"
            style={{
              padding: '8px 22px',
              fontSize: '0.86rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            Continue to Details <ArrowRight size={15} />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleBackToStep1}
            className="secondary-action"
            style={{
              fontSize: '0.82rem',
              padding: '7px 14px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            <ArrowLeft size={14} /> Change Stage
          </button>
        )}
      </div>

      {/* STEP 1: Lifecycle Selection Cards (1 Row on Desktop, Single Screen Fit) */}
      {step === 1 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '14px',
              marginBottom: '16px',
            }}
          >
            {STAGES_CONFIG.map((cfg) => {
              const isSelected = selectedStage === cfg.id;
              const IconComponent = cfg.icon;
              return (
                <div
                  key={cfg.id}
                  onClick={() => handleStageSelect(cfg.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      handleStageSelect(cfg.id);
                    }
                  }}
                  style={{
                    cursor: 'pointer',
                    borderRadius: '14px',
                    padding: '16px 18px',
                    backgroundColor: isSelected ? 'rgba(181, 121, 142, 0.08)' : '#ffffff',
                    border: `2px solid ${isSelected ? '#944b63' : 'rgba(181, 121, 142, 0.2)'}`,
                    boxShadow: isSelected
                      ? '0 10px 24px -5px rgba(148, 75, 99, 0.16)'
                      : '0 2px 6px rgba(44, 27, 34, 0.03)',
                    transition: 'all 0.18s ease-in-out',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '210px',
                    userSelect: 'none',
                  }}
                >
                  <div>
                    {/* Top Row: Icon + Selection Pill */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div
                        style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '10px',
                          backgroundColor: cfg.iconBg,
                          color: cfg.iconColor,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <IconComponent size={20} />
                      </div>

                      {isSelected ? (
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            backgroundColor: '#944b63',
                            color: '#ffffff',
                            padding: '2px 8px',
                            borderRadius: '999px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            letterSpacing: '0.02em',
                          }}
                        >
                          <Check size={11} /> Selected
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            backgroundColor: 'rgba(44, 27, 34, 0.05)',
                            color: '#7a6a72',
                            padding: '2px 7px',
                            borderRadius: '999px',
                          }}
                        >
                          {cfg.badge}
                        </span>
                      )}
                    </div>

                    {/* Title & Modern Tagline */}
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#2c1b22', margin: '0 0 3px 0' }}>
                      {cfg.title}
                    </h3>
                    <p style={{ fontSize: '0.8rem', color: '#685860', margin: '0 0 10px 0', lineHeight: 1.35, minHeight: '32px' }}>
                      {cfg.tagline}
                    </p>
                  </div>

                  {/* Highlights List */}
                  <div style={{ borderTop: '1px solid rgba(181, 121, 142, 0.12)', paddingTop: '10px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      {cfg.highlights.map((h, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#49373f' }}>
                          <span
                            style={{
                              width: '5px',
                              height: '5px',
                              borderRadius: '50%',
                              backgroundColor: isSelected ? '#944b63' : '#a898a0',
                              flexShrink: 0,
                            }}
                          />
                          <span style={{ lineHeight: 1.25 }}>{h}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom helper & Proceed button */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: '6px',
            }}
          >
            <span style={{ fontSize: '0.78rem', color: '#8c7781' }}>
              Selected phase automatically customizes required fields, validation rules, and email recommendations.
            </span>
            <button
              type="button"
              onClick={handleProceedToStep2}
              className="primary-action"
              style={{
                padding: '8px 24px',
                fontSize: '0.86rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              Continue to Details <ArrowRight size={15} />
            </button>
          </div>
        </motion.div>
      )}

      {/* STEP 2: Dynamic Employee Information Form */}
      {step === 2 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {/* Explanatory Guidance Card by Lifecycle Status with Modern Text */}
          <div
            style={{
              padding: '14px 18px',
              borderRadius: '12px',
              backgroundColor: 'rgba(181, 121, 142, 0.08)',
              border: '1px solid rgba(181, 121, 142, 0.2)',
              marginBottom: '18px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
            }}
          >
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '9px',
                backgroundColor: '#ffffff',
                color: '#944b63',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: '0 2px 5px rgba(181, 121, 142, 0.12)',
              }}
            >
              {selectedStage === 'ONBOARDING' && <UserPlus size={18} />}
              {selectedStage === 'ACTIVE' && <UserCheck size={18} />}
              {selectedStage === 'OFFBOARDING' && <LogOut size={18} />}
              {selectedStage === 'EXITED' && <UserMinus size={18} />}
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#2c1b22' }}>
                  {selectedStage === 'ONBOARDING' && 'Incoming Hire Onboarding Workflow'}
                  {selectedStage === 'ACTIVE' && 'Active Personnel Record'}
                  {selectedStage === 'OFFBOARDING' && 'Departure & Transition Coordination'}
                  {selectedStage === 'EXITED' && 'Historical Alumni Record'}
                </span>
                <span
                  style={{
                    fontSize: '0.66rem',
                    fontWeight: 700,
                    backgroundColor: '#944b63',
                    color: '#ffffff',
                    padding: '1px 7px',
                    borderRadius: '4px',
                    textTransform: 'uppercase',
                  }}
                >
                  {selectedStage}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#685860', lineHeight: 1.4 }}>
                {selectedStage === 'ONBOARDING' &&
                  'Setting up your incoming hire. We track scheduled joining dates, coordinate orientation milestones, and prepare automated welcome communication.'}
                {selectedStage === 'ACTIVE' &&
                  'Enrolling confirmed staff into your organization directory. Enables department and designation tracking, journey milestones, and future transitions.'}
                {selectedStage === 'OFFBOARDING' &&
                  'Coordinating departure logistics. Schedules the planned last working day, asset recovery, IT wrap-up, and automated exit feedback invitations.'}
                {selectedStage === 'EXITED' &&
                  'Archiving past employment records. Stores verified departure dates, tenure references, and relieving remarks for institutional memory.'}
              </p>
            </div>
          </div>

          {/* If offboarding, show the 8-item checklist preview */}
          {selectedStage === 'OFFBOARDING' && (
            <div
              style={{
                padding: '16px 20px',
                borderRadius: '14px',
                backgroundColor: '#ffffff',
                border: '1px solid rgba(181, 121, 142, 0.2)',
                marginBottom: '20px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <ClipboardList size={16} style={{ color: '#944b63' }} />
                <span style={{ fontSize: '0.84rem', fontWeight: 600, color: '#2c1b22' }}>
                  Offboarding Workflow Touchpoints (Auto-assigned)
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '6px' }}>
                {OFFBOARDING_CHECKLIST_ITEMS.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: '#49373f' }}>
                    <span style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: 'rgba(181, 121, 142, 0.15)', color: '#944b63', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.68rem', fontWeight: 700 }}>
                      {idx + 1}
                    </span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="panel" style={{ padding: '24px' }}>
            <div className="form-grid">
              {/* Full Name */}
              <div className="form-field">
                <div className="field-label-row">
                  <label htmlFor="fullName">Full Name *</label>
                </div>
                <input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Avery Morgan"
                  required
                />
                {errors.fullName && <p className="field-error" style={{ color: '#dc3545', fontSize: '0.78rem', margin: '4px 0 0 0' }}>{errors.fullName}</p>}
              </div>

              {/* Work Email */}
              <div className="form-field">
                <div className="field-label-row">
                  <label htmlFor="workEmail">Work Email *</label>
                </div>
                <input
                  id="workEmail"
                  type="email"
                  value={workEmail}
                  onChange={(e) => setWorkEmail(e.target.value)}
                  placeholder="name@company.com"
                  required
                />
                {errors.workEmail && <p className="field-error" style={{ color: '#dc3545', fontSize: '0.78rem', margin: '4px 0 0 0' }}>{errors.workEmail}</p>}
              </div>

              {/* Personal Email */}
              <div className="form-field">
                <div className="field-label-row">
                  <label htmlFor="personalEmail">Personal Email</label>
                  <span className="field-hint">Optional</span>
                </div>
                <input
                  id="personalEmail"
                  type="email"
                  value={personalEmail}
                  onChange={(e) => setPersonalEmail(e.target.value)}
                  placeholder="name@gmail.com"
                />
                {errors.personalEmail && <p className="field-error" style={{ color: '#dc3545', fontSize: '0.78rem', margin: '4px 0 0 0' }}>{errors.personalEmail}</p>}
              </div>

              {/* Phone */}
              <div className="form-field">
                <div className="field-label-row">
                  <label htmlFor="phone">Phone Number</label>
                  <span className="field-hint">Optional</span>
                </div>
                <input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                />
              </div>

              {/* Department */}
              <div className="form-field">
                <div className="field-label-row">
                  <label htmlFor="department">Department *</label>
                </div>
                <AnimatedSelect
                  id="department"
                  variant="form"
                  placeholder="Select department"
                  value={department}
                  onChange={setDepartment}
                  options={deptList.map((dept) => ({ value: dept, label: dept }))}
                />
                {errors.department && <p className="field-error" style={{ color: '#dc3545', fontSize: '0.78rem', margin: '4px 0 0 0' }}>{errors.department}</p>}
              </div>

              {/* Designation */}
              <div className="form-field">
                <div className="field-label-row">
                  <label htmlFor="designation">Designation / Role</label>
                  <span className="field-hint">Optional</span>
                </div>
                <AnimatedSelect
                  id="designation"
                  variant="form"
                  placeholder="Select role (optional)"
                  value={designation}
                  onChange={setDesignation}
                  options={(designations || []).map((des) => ({
                    value: des.designationName,
                    label: des.designationName,
                  }))}
                />
              </div>

              {/* Employee ID / Code */}
              <div className="form-field">
                <div className="field-label-row">
                  <label htmlFor="employeeCode">Employee ID / Code</label>
                  <span className="field-hint">Auto-generated if empty</span>
                </div>
                <input
                  id="employeeCode"
                  type="text"
                  value={employeeCode}
                  onChange={(e) => setEmployeeCode(e.target.value)}
                  placeholder="e.g. EMP-10492"
                />
              </div>

              {/* Joining Date */}
              <div className="form-field">
                <div className="field-label-row">
                  <label htmlFor="joiningDate">Joining Date *</label>
                  {selectedStage === 'ONBOARDING' && <span className="field-hint">Today or future date</span>}
                  {selectedStage === 'ACTIVE' && <span className="field-hint">Past or today</span>}
                </div>
                <DatePicker
                  id="joiningDate"
                  value={joiningDate}
                  onChange={setJoiningDate}
                  placeholder="Select joining date"
                  required
                />
                {errors.joiningDate && <p className="field-error" style={{ color: '#dc3545', fontSize: '0.78rem', margin: '4px 0 0 0' }}>{errors.joiningDate}</p>}
              </div>

              {/* Status Specific: OFFBOARDING */}
              {selectedStage === 'OFFBOARDING' && (
                <>
                  <div className="form-field">
                    <div className="field-label-row">
                      <label htmlFor="lastWorkingDay">Last Working Day *</label>
                      <span className="field-hint">Today or future date</span>
                    </div>
                    <DatePicker
                      id="lastWorkingDay"
                      value={lastWorkingDay}
                      onChange={setLastWorkingDay}
                      placeholder="Select scheduled last working day"
                      required
                    />
                    {errors.lastWorkingDay && <p className="field-error" style={{ color: '#dc3545', fontSize: '0.78rem', margin: '4px 0 0 0' }}>{errors.lastWorkingDay}</p>}
                  </div>

                  <div className="form-field">
                    <div className="field-label-row">
                      <label htmlFor="exitReason">Reason for Leaving</label>
                      <span className="field-hint">Optional</span>
                    </div>
                    <AnimatedSelect
                      id="exitReason"
                      variant="form"
                      placeholder="Select reason"
                      value={exitReason}
                      onChange={setExitReason}
                      options={DEPARTURE_REASONS.map((r) => ({ value: r, label: r }))}
                    />
                  </div>

                  <div className="form-field" style={{ gridColumn: '1 / -1' }}>
                    <div className="field-label-row">
                      <label htmlFor="exitNotes">Offboarding Notes & Handover Context</label>
                      <span className="field-hint">Optional</span>
                    </div>
                    <textarea
                      id="exitNotes"
                      value={exitNotes}
                      onChange={(e) => setExitNotes(e.target.value)}
                      placeholder="Key handover tasks, asset tracking notes, or project continuity plan..."
                      rows={3}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: '1px solid #dcd1d7',
                        fontSize: '0.86rem',
                        fontFamily: 'inherit',
                      }}
                    />
                  </div>
                </>
              )}

              {/* Status Specific: EXITED */}
              {selectedStage === 'EXITED' && (
                <>
                  <div className="form-field">
                    <div className="field-label-row">
                      <label htmlFor="exitDate">Actual Exit Date *</label>
                      <span className="field-hint">Past date or today</span>
                    </div>
                    <DatePicker
                      id="exitDate"
                      value={exitDate}
                      onChange={setExitDate}
                      placeholder="Select recorded exit date"
                      required
                    />
                    {errors.exitDate && <p className="field-error" style={{ color: '#dc3545', fontSize: '0.78rem', margin: '4px 0 0 0' }}>{errors.exitDate}</p>}
                  </div>

                  <div className="form-field">
                    <div className="field-label-row">
                      <label htmlFor="exitReason">Reason for Departure</label>
                      <span className="field-hint">Optional</span>
                    </div>
                    <AnimatedSelect
                      id="exitReason"
                      variant="form"
                      placeholder="Select departure reason"
                      value={exitReason}
                      onChange={setExitReason}
                      options={DEPARTURE_REASONS.map((r) => ({ value: r, label: r }))}
                    />
                  </div>

                  <div className="form-field" style={{ gridColumn: '1 / -1' }}>
                    <div className="field-label-row">
                      <label htmlFor="exitNotes">Historical Record Notes</label>
                      <span className="field-hint">Optional</span>
                    </div>
                    <textarea
                      id="exitNotes"
                      value={exitNotes}
                      onChange={(e) => setExitNotes(e.target.value)}
                      placeholder="Archived notes, relieving remarks, or clearance references..."
                      rows={3}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: '1px solid #dcd1d7',
                        fontSize: '0.86rem',
                        fontFamily: 'inherit',
                      }}
                    />
                  </div>
                </>
              )}
            </div>

            <div className="form-actions" style={{ marginTop: '24px', display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button
                type="submit"
                className="primary-action"
                disabled={createMutation.isPending}
                style={{ padding: '9px 24px', fontSize: '0.88rem' }}
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Saving Employee…
                  </>
                ) : (
                  <>
                    <Check size={16} /> Save Employee Record
                  </>
                )}
              </button>

              <button
                type="button"
                className="secondary-action"
                onClick={handleBackToStep1}
                disabled={createMutation.isPending}
              >
                Back to Stage Selection
              </button>
            </div>
          </form>
        </motion.div>
      )}
    </div>
  );
}

