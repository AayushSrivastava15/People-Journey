import * as React from 'react';
import { useState, useMemo, useRef } from 'react';
import { useLocation } from 'wouter';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  History,
  Download,
  Pencil,
  Trash2,
  ChevronRight,
  ChevronLeft,
  Search,
  ArrowRight,
  ArrowLeft,
  Check,
  X,
  Loader2,
  RefreshCw,
  Eye,
  Info,
  Calendar,
  Layers,
  Settings2,
  RotateCcw,
  CheckSquare,
  Square,
  GitCompare,
  Building2,
  Users,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import {
  useUploadImportFile,
  useSelectSheets,
  useUpdateSheetHeader,
  useUpdateSheetConfig,
  useValidateMultiSheetMapping,
  useImportPreview,
  useUpdatePreviewRow,
  useRevertPreviewRow,
  useToggleRowApproval,
  useBulkSetApproval,
  useDeletePreviewRow,
  useCommitImport,
  useImportHistory,
  downloadImportTemplateFile,
  downloadImportErrorsFile,
} from '@/api/queries';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { AnimatedSelect, type SelectOption } from '@/components/ui/animated-select';
import type {
  UploadExcelResponse,
  ColumnDetectionResult,
  CanonicalFieldDefinition,
  ValidatedImportRow,
  ImportSummary,
  SheetSessionData,
  SheetCategory,
  FieldDiff,
  ReconciliationType,
} from '@/types/api';

type WizardStep = 'upload' | 'sheets' | 'preview' | 'commit' | 'complete';

const LIFECYCLE_OPTIONS: SelectOption[] = [
  { value: 'ONBOARDING', label: 'Onboarding', subtext: 'Upcoming new joiner' },
  { value: 'ACTIVE', label: 'Active', subtext: 'Currently working employee' },
  { value: 'OFFBOARDING', label: 'Offboarding', subtext: 'Serving notice period (LWD required)' },
  { value: 'EXITED', label: 'Exited', subtext: 'Former employee (Exit date required)' },
];

const CATEGORY_OPTIONS: SelectOption[] = [
  { value: 'REGULAR', label: 'Regular Employee', subtext: 'Permanent / direct staff roster' },
  { value: 'THIRD_PARTY', label: 'Third Party Workforce', subtext: 'Contractor / vendor workforce' },
];

export function SmartEmployeeImportWizard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Wizard Navigation: 4 Main Stages
  const [currentStep, setCurrentStep] = useState<WizardStep>('upload');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sheetInspectorOpen, setSheetInspectorOpen] = useState(false);

  // Session State & Sheet Selection
  const [uploadData, setUploadData] = useState<UploadExcelResponse | null>(null);
  const [sheets, setSheets] = useState<SheetSessionData[]>([]);
  const [selectedSheets, setSelectedSheets] = useState<Set<string>>(new Set());
  const [lifecycleInspectorRow, setLifecycleInspectorRow] = useState<ValidatedImportRow | null>(null);

  // Preview Pagination & Filter State
  const [previewFilter, setPreviewFilter] = useState<
    'all' | 'needs_attention' | 'valid' | 'existing_updates' | 'third_party' | 'historical_exits'
  >('all');
  const [previewSearch, setPreviewSearch] = useState('');
  const [previewPage, setPreviewPage] = useState(1);
  const [previewLimit, setPreviewLimit] = useState(10);

  // Inline Editing State (row index -> field -> temporary string)
  const [inlineEditingRowId, setInlineEditingRowId] = useState<number | null>(null);
  const [inlineEditField, setInlineEditField] = useState<string | null>(null);
  const [inlineEditValue, setInlineEditValue] = useState<string>('');

  // Full Edit Modal State
  const [editingRow, setEditingRow] = useState<ValidatedImportRow | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<ValidatedImportRow['mappedData']>>({});
  const [editCategory, setEditCategory] = useState<'REGULAR' | 'THIRD_PARTY'>('REGULAR');
  const [editVendor, setEditVendor] = useState<string>('');

  // Comparison Modal State (Side-by-Side DB Diff)
  const [diffModalRow, setDiffModalRow] = useState<ValidatedImportRow | null>(null);

  // Import Commit Result
  const [commitResult, setCommitResult] = useState<{
    totalProcessed: number;
    importedCount: number;
    skippedCount: number;
    errorCount: number;
    duplicateCount: number;
    statusBreakdown: Record<string, number>;
  } | null>(null);

  // Mutations & Queries
  const uploadMutation = useUploadImportFile();
  const selectSheetsMutation = useSelectSheets();
  const updateRowMutation = useUpdatePreviewRow();
  const revertRowMutation = useRevertPreviewRow();
  const toggleApprovalMutation = useToggleRowApproval();
  const bulkApprovalMutation = useBulkSetApproval();
  const deleteRowMutation = useDeletePreviewRow();
  const commitMutation = useCommitImport();
  const { data: importHistory = [], isLoading: historyLoading } = useImportHistory();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const [isDownloadingErrors, setIsDownloadingErrors] = useState(false);

  const sessionId = uploadData?.sessionId || null;
  const {
    data: previewData,
    isLoading: previewLoading,
    refetch: refetchPreview,
  } = useImportPreview(sessionId, {
    page: previewPage,
    limit: previewLimit,
    filter: previewFilter,
    search: previewSearch,
  });

  const summary: ImportSummary = previewData?.summary || uploadData?.summary || {
    totalRecords: 0,
    validRecords: 0,
    needsAttentionRecords: 0,
    duplicateRecords: 0,
    existingUpdatesCount: 0,
    thirdPartyCount: 0,
    historicalExitsCount: 0,
    approvedCount: 0,
    statusBreakdown: { onboarding: 0, active: 0, offboarding: 0, exited: 0 },
  };

  const previewRows: ValidatedImportRow[] = previewData?.rows || [];
  const totalPages = previewData?.totalPages || 1;
  const totalFiltered = previewData?.totalFiltered || 0;

  // =========================================================================
  // Stage 1: File Upload Handler & Sheet Initialization
  // =========================================================================

  const processUploadedFile = (file: File) => {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      toast({
        variant: 'destructive',
        title: 'Unsupported File Type',
        description: 'Please upload an Excel document (.xlsx or .xls).',
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        variant: 'destructive',
        title: 'File Too Large',
        description: 'Uploaded file exceeds the 10MB size limit. Please upload a smaller file.',
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const base64 = (e.target?.result as string).split(',')[1];
        if (!base64) throw new Error('Could not read file data');

        const res = await uploadMutation.mutateAsync({
          fileBase64: base64,
          fileName: file.name,
        });

        setUploadData(res);
        setSheets(res.sheets || []);

        // Intelligently select relevant employee sheets by default
        const initialSelected = (res.sheets || [])
          .filter((s) => s.defaultInclude !== false && s.importable !== false)
          .map((s) => s.sheetName);
        setSelectedSheets(new Set(initialSelected));

        // Advance to Stage 2: Choose Sheets
        setCurrentStep('sheets');

        toast({
          title: 'Workbook Analyzed',
          description: `Identified ${res.sheets?.length || 0} worksheets in ${file.name}. Please confirm the sheets to import.`,
        });
      } catch (err) {
        toast({
          variant: 'destructive',
          title: 'Upload Failed',
          description: (err as Error).message || 'Failed to parse Excel spreadsheet.',
        });
      }
    };
    reader.readAsDataURL(file);
  };

  // =========================================================================
  // Stage 2: Worksheet Selection Handlers
  // =========================================================================

  const toggleSheetSelection = (sheetName: string) => {
    setSelectedSheets((prev) => {
      const next = new Set(prev);
      if (next.has(sheetName)) {
        next.delete(sheetName);
      } else {
        next.add(sheetName);
      }
      return next;
    });
  };

  const handleSelectAllSheets = () => {
    const all = new Set(sheets.map((s) => s.sheetName));
    setSelectedSheets(all);
  };

  const handleClearAllSheets = () => {
    setSelectedSheets(new Set());
  };

  const handleConfirmSheetSelection = async () => {
    if (!sessionId) return;
    try {
      const res = await selectSheetsMutation.mutateAsync({
        sessionId,
        selectedSheets: Array.from(selectedSheets),
      });

      setSheets(res.sheets || []);
      setCurrentStep('preview');
      setPreviewPage(1);
      refetchPreview();

      toast({
        title: 'Worksheets Extracted & Reconciled',
        description: `Reconciled ${res.totalRows} employee records across ${selectedSheets.size} selected sheets. Ready for review.`,
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Extraction Failed',
        description: (err as Error).message || 'Failed to extract selected worksheets.',
      });
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processUploadedFile(files[0]);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      setIsDownloadingTemplate(true);
      await downloadImportTemplateFile();
      toast({
        title: 'Template Downloaded',
        description: 'The standard employee template was saved to your device.',
      });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Download Failed',
        description: 'Could not download template. Please try again.',
      });
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  const handleDownloadErrors = async () => {
    if (!sessionId) return;
    try {
      setIsDownloadingErrors(true);
      await downloadImportErrorsFile(sessionId);
      toast({
        title: 'Error Report Exported',
        description: 'Downloaded rows requiring attention.',
      });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Export Failed',
        description: 'Could not export error report.',
      });
    } finally {
      setIsDownloadingErrors(false);
    }
  };

  // =========================================================================
  // Stage 2: Inline & Dialog Editing Handlers
  // =========================================================================

  const startInlineEdit = (row: ValidatedImportRow, field: string) => {
    setInlineEditingRowId(row.rowIndex);
    setInlineEditField(field);
    setInlineEditValue(String((row.mappedData as any)[field] || ''));
  };

  const saveInlineEdit = async (row: ValidatedImportRow) => {
    if (!sessionId || !inlineEditField) return;
    const fieldName = inlineEditField;
    const newVal = inlineEditValue.trim();

    // Reset inline edit state immediately
    setInlineEditingRowId(null);
    setInlineEditField(null);

    try {
      await updateRowMutation.mutateAsync({
        sessionId,
        rowIndex: row.rowIndex,
        data: {
          [fieldName]: newVal,
        },
      });

      toast({
        title: 'Field Updated',
        description: `Row ${row.rowIndex} updated and revalidated. Marked as Manually Edited.`,
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: (err as Error).message || 'Failed to update field.',
      });
    }
  };

  const cancelInlineEdit = () => {
    setInlineEditingRowId(null);
    setInlineEditField(null);
  };

  const openFullEditModal = (row: ValidatedImportRow) => {
    setEditingRow(row);
    setEditFormData({ ...row.mappedData });
    setEditCategory(row.isThirdParty ? 'THIRD_PARTY' : 'REGULAR');
    setEditVendor(row.vendor || '');
  };

  const saveFullEditModal = async () => {
    if (!sessionId || !editingRow) return;

    // Client-side quick checks
    if (!editFormData.employeeCode?.trim()) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'Employee ID / Code is mandatory. Never auto-generated.',
      });
      return;
    }

    if (!editFormData.fullName?.trim() && !editFormData.firstName?.trim()) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'Employee name is required.',
      });
      return;
    }

    if (
      (editFormData.employmentStatus === 'OFFBOARDING' || editFormData.employmentStatus === 'EXITED') &&
      !editFormData.lastWorkingDay?.trim()
    ) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'Last Working Day is mandatory for offboarding and exited employees.',
      });
      return;
    }

    try {
      await updateRowMutation.mutateAsync({
        sessionId,
        rowIndex: editingRow.rowIndex,
        data: {
          ...editFormData,
          vendor: editCategory === 'THIRD_PARTY' ? editVendor : undefined,
          employmentCategory: editCategory,
        },
      });

      toast({
        title: 'Record Saved',
        description: `Employee record for ${editFormData.fullName || editFormData.employeeCode} revalidated.`,
      });
      setEditingRow(null);
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Save Failed',
        description: (err as Error).message || 'Could not save employee edits.',
      });
    }
  };

  const handleRevertRow = async (row: ValidatedImportRow) => {
    if (!sessionId) return;
    try {
      await revertRowMutation.mutateAsync({
        sessionId,
        rowIndex: row.rowIndex,
      });

      toast({
        title: 'Record Reverted',
        description: `Row ${row.rowIndex} restored to original Excel extracted data.`,
      });

      if (editingRow && editingRow.rowIndex === row.rowIndex) {
        setEditingRow(null);
      }
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Revert Failed',
        description: (err as Error).message || 'Could not revert record.',
      });
    }
  };

  const handleToggleApproval = async (row: ValidatedImportRow) => {
    if (!sessionId) return;
    try {
      await toggleApprovalMutation.mutateAsync({
        sessionId,
        rowIndex: row.rowIndex,
        approved: !row.approvedForImport,
      });

      toast({
        title: row.approvedForImport ? 'Record Excluded' : 'Record Approved',
        description: row.approvedForImport
          ? `Row ${row.rowIndex} will be skipped during import.`
          : `Row ${row.rowIndex} approved for database import.`,
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Approval Failed',
        description: (err as Error).message || 'Could not update approval status.',
      });
    }
  };

  const handleBulkApproval = async (
    filterType: 'all' | 'existing_updates' | 'historical_exits' | 'valid_only',
    approved: boolean
  ) => {
    if (!sessionId) return;
    try {
      await bulkApprovalMutation.mutateAsync({
        sessionId,
        filterType,
        approved,
      });

      toast({
        title: approved ? 'Bulk Approval Applied' : 'Bulk Excluded',
        description: `Updated approval status for all records in category.`,
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Bulk Action Failed',
        description: (err as Error).message || 'Could not update records.',
      });
    }
  };

  const handleDeleteRow = async (row: ValidatedImportRow) => {
    if (!sessionId) return;
    try {
      await deleteRowMutation.mutateAsync({
        sessionId,
        rowIndex: row.rowIndex,
      });

      toast({
        title: 'Row Removed',
        description: `Row ${row.rowIndex} (${row.mappedData.fullName || row.mappedData.employeeCode}) was removed from import.`,
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Delete Failed',
        description: (err as Error).message || 'Could not remove row.',
      });
    }
  };

  // =========================================================================
  // Stage 3: Final Commit Handler
  // =========================================================================

  const handleCommitImport = async () => {
    if (!sessionId) return;

    try {
      const res = await commitMutation.mutateAsync({
        sessionId,
        mode: 'valid_only',
      });

      setCommitResult(res.result);
      setCurrentStep('complete');
      toast({
        title: 'Import Completed Successfully',
        description: `${res.result.importedCount} employees were imported or updated in your workspace.`,
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Import Failed',
        description: (err as Error).message || 'Failed to complete employee import.',
      });
    }
  };

  // =========================================================================
  // Render Helper Badges
  // =========================================================================

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            Active
          </span>
        );
      case 'ONBOARDING':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
            Onboarding
          </span>
        );
      case 'OFFBOARDING':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
            Offboarding
          </span>
        );
      case 'EXITED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-300">
            Exited
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-stone-100 text-stone-700">
            {status}
          </span>
        );
    }
  };

  const getReconciliationBadge = (row: ValidatedImportRow) => {
    if (row.reconciliationType === 'EXISTING_UPDATE' || row.reconciliationType === 'LIFECYCLE_CHANGE') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
          <GitCompare className="w-3 h-3" />
          Update Proposed
        </span>
      );
    }
    if (row.reconciliationType === 'RESTORATION') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-teal-50 text-teal-700 border border-teal-200">
          <RotateCcw className="w-3 h-3" />
          Restoration
        </span>
      );
    }
    if (row.reconciliationType === 'LOCATION_TRANSFER') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-cyan-50 text-cyan-700 border border-cyan-200">
          <Building2 className="w-3 h-3" />
          Transfer
        </span>
      );
    }
    if (row.reconciliationType === 'HISTORICAL_EXIT') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-stone-100 text-stone-700 border border-stone-300">
          Historical Exit
        </span>
      );
    }
    if (row.isThirdParty) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200">
          <Users className="w-3 h-3" />
          Third Party
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
        New Employee
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Wizard Progress Bar */}
      <div className="bg-white rounded-xl border border-stone-200 p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-2 sm:space-x-3 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            {/* Step 1 */}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                currentStep === 'upload'
                  ? 'bg-rose-50 text-rose-900 font-semibold border border-rose-200'
                  : 'text-stone-500 hover:text-stone-700'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                  currentStep === 'upload'
                    ? 'bg-rose-900 text-white'
                    : uploadData
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-stone-100 text-stone-500'
                }`}
              >
                {uploadData && currentStep !== 'upload' ? <Check className="w-3.5 h-3.5" /> : '1'}
              </div>
              <span>1. Upload Excel</span>
            </div>

            <ChevronRight className="w-4 h-4 text-stone-300 shrink-0" />

            {/* Step 2: Choose Sheets */}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                currentStep === 'sheets'
                  ? 'bg-rose-50 text-rose-900 font-semibold border border-rose-200'
                  : 'text-stone-500'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                  currentStep === 'sheets'
                    ? 'bg-rose-900 text-white'
                    : currentStep === 'preview' || currentStep === 'commit' || currentStep === 'complete'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-stone-100 text-stone-500'
                }`}
              >
                {currentStep === 'preview' || currentStep === 'commit' || currentStep === 'complete' ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  '2'
                )}
              </div>
              <span>2. Choose Sheets</span>
            </div>

            <ChevronRight className="w-4 h-4 text-stone-300 shrink-0" />

            {/* Step 3: Review & Edit */}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                currentStep === 'preview'
                  ? 'bg-rose-50 text-rose-900 font-semibold border border-rose-200'
                  : 'text-stone-500'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                  currentStep === 'preview'
                    ? 'bg-rose-900 text-white'
                    : currentStep === 'commit' || currentStep === 'complete'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-stone-100 text-stone-500'
                }`}
              >
                {currentStep === 'commit' || currentStep === 'complete' ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  '3'
                )}
              </div>
              <span>3. Review & Edit</span>
            </div>

            <ChevronRight className="w-4 h-4 text-stone-300 shrink-0" />

            {/* Step 4: Final Confirmation */}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                currentStep === 'commit' || currentStep === 'complete'
                  ? 'bg-rose-50 text-rose-900 font-semibold border border-rose-200'
                  : 'text-stone-500'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                  currentStep === 'commit' || currentStep === 'complete'
                    ? 'bg-rose-900 text-white'
                    : 'bg-stone-100 text-stone-500'
                }`}
              >
                {currentStep === 'complete' ? <Check className="w-3.5 h-3.5" /> : '4'}
              </div>
              <span>4. Final Confirmation</span>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={handleDownloadTemplate}
              disabled={isDownloadingTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-700 bg-stone-50 hover:bg-stone-100 rounded-lg border border-stone-200 transition-colors"
            >
              {isDownloadingTemplate ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              <span>Starter Template (.xlsx)</span>
            </button>

            <button
              onClick={() => setHistoryOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-700 bg-stone-50 hover:bg-stone-100 rounded-lg border border-stone-200 transition-colors"
            >
              <History className="w-3.5 h-3.5" />
              <span>Import History</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* STAGE 1: UPLOAD EXCEL FILE                                               */}
      {/* ========================================================================= */}
      {currentStep === 'upload' && (
        <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-8">
          <div className="max-w-xl mx-auto text-center space-y-6">
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto text-primary">
              <FileSpreadsheet className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-serif font-bold text-stone-900">
                Smart Excel Employee Import
              </h2>
              <p className="text-stone-500 text-sm leading-relaxed">
                Upload your company's Excel workbook (.xlsx or .xls). People Journey automatically
                analyzes your worksheets, reconciles employee rosters, third-party workforce, resignation
                trackers, and transfers into unified employee records for your review.
              </p>
            </div>

            {/* Drop Zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-10 cursor-pointer transition-all ${
                isDragging
                  ? 'border-primary bg-primary/5 scale-[1.01]'
                  : 'border-stone-300 hover:border-primary/50 hover:bg-stone-50/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    processUploadedFile(e.target.files[0]);
                  }
                }}
              />

              <div className="flex flex-col items-center justify-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center text-stone-600">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-stone-800">
                    <span className="text-primary hover:underline font-semibold">Click to browse</span> or drag and drop your workbook here
                  </p>
                  <p className="text-xs text-stone-400">
                    Supports Microsoft Excel (.xlsx, .xls) up to 10MB
                  </p>
                </div>
              </div>
            </div>

            {uploadMutation.isPending && (
              <div className="p-4 bg-primary/5 rounded-xl border border-primary/20 space-y-2">
                <div className="flex items-center justify-center gap-2 text-primary font-medium text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Analyzing workbook & reconciling employee records...</span>
                </div>
                <p className="text-xs text-stone-500">
                  Detecting header rows, multi-sheet relationships, and checking existing records.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-stone-100 text-left">
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-stone-50">
                <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-semibold text-stone-800">Automatic Sheet Detection</p>
                  <p className="text-stone-500">Filters instructions, dashboards, and closed roles automatically.</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-stone-50">
                <GitCompare className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-semibold text-stone-800">Lifecycle Reconciliation</p>
                  <p className="text-stone-500">Reconciles MIS, contractors, resignations, and transfers.</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-stone-50">
                <Pencil className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-semibold text-stone-800">Fully Editable Preview</p>
                  <p className="text-stone-500">Review and edit any field before importing to PostgreSQL.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STAGE 2: CHOOSE SHEETS TO IMPORT                                         */}
      {/* ========================================================================= */}
      {currentStep === 'sheets' && (
        <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-6 sm:p-8 space-y-6">
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-100 pb-5">
              <div>
                <h2 className="text-xl sm:text-2xl font-serif font-bold text-stone-900">
                  Choose Sheets to Import
                </h2>
                <p className="text-stone-500 text-xs sm:text-sm mt-1">
                  We detected multiple worksheets in your workbook. Select which sheets to extract employees from:
                </p>
              </div>

              <div className="flex items-center gap-3 self-end sm:self-auto">
                <span className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-stone-100 text-stone-700 border border-stone-200">
                  {selectedSheets.size} of {sheets.length} sheets selected
                </span>
                <button
                  type="button"
                  onClick={handleSelectAllSheets}
                  className="px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/5 rounded border border-primary/20 transition-colors"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={handleClearAllSheets}
                  className="px-2.5 py-1 text-xs font-medium text-stone-600 hover:bg-stone-100 rounded border border-stone-200 transition-colors"
                >
                  Clear All
                </button>
              </div>
            </div>

            {/* Sheet List */}
            <div className="space-y-3">
              {sheets.map((sheet) => {
                const isSelected = selectedSheets.has(sheet.sheetName);
                const isDefaultIncluded = sheet.defaultInclude !== false && sheet.importable !== false;

                return (
                  <div
                    key={sheet.sheetName}
                    onClick={() => toggleSheetSelection(sheet.sheetName)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                      isSelected
                        ? 'bg-white border-primary/40 shadow-sm ring-1 ring-primary/20'
                        : 'bg-stone-50/60 border-stone-200 opacity-75 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="pt-0.5">
                        {isSelected ? (
                          <CheckSquare className="w-5 h-5 text-primary" />
                        ) : (
                          <Square className="w-5 h-5 text-stone-300" />
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-stone-900 text-sm">
                            {sheet.sheetName}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                              sheet.category === 'REGULAR_EMPLOYEES'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : sheet.category === 'RESIGNATION_TRACKER'
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : sheet.category === 'THIRD_PARTY'
                                ? 'bg-sky-50 text-sky-700 border-sky-200'
                                : sheet.category === 'TRANSFER'
                                ? 'bg-cyan-50 text-cyan-700 border-cyan-200'
                                : sheet.category === 'RETENTION_TRACKER'
                                ? 'bg-teal-50 text-teal-700 border-teal-200'
                                : sheet.category === 'RECRUITMENT'
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                : 'bg-stone-100 text-stone-600 border-stone-200'
                            }`}
                          >
                            {sheet.detectedContentType || sheet.categoryLabel}
                          </span>

                          {!isDefaultIncluded && (
                            <span className="text-[10px] text-stone-400 italic">
                              (Ignored by default)
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-stone-600">
                          {sheet.contentDescription || `Contains approximately ${sheet.estimatedDataRows} rows with columns: ${sheet.detectedHeaders.slice(0, 4).join(', ')}...`}
                        </p>

                        <div className="flex items-center gap-4 text-[11px] text-stone-400 font-mono pt-0.5">
                          <span>~{sheet.estimatedDataRows} data rows</span>
                          <span>•</span>
                          <span>{sheet.columnCount} columns</span>
                          <span>•</span>
                          <span>Header Row {sheet.headerRowIndex}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 sm:self-center shrink-0">
                      <span
                        className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                          isSelected
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-stone-100 text-stone-500 border border-stone-200'
                        }`}
                      >
                        {isSelected ? 'Include' : 'Ignore'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-4 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setCurrentStep('upload')}
                className="px-4 py-2 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 text-xs font-medium transition-colors flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Upload</span>
              </button>

              <button
                type="button"
                onClick={handleConfirmSheetSelection}
                disabled={selectedSheets.size === 0 || selectSheetsMutation.isPending}
                className="px-5 py-2.5 rounded-lg bg-primary hover:bg-primary/95 text-white text-xs font-semibold shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {selectSheetsMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Extract & Review Employees ({selectedSheets.size} sheets)</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STAGE 2: REVIEW & EDIT EXTRACTED EMPLOYEES                               */}
      {/* ========================================================================= */}
      {currentStep === 'preview' && (
        <div className="space-y-6">
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm">
              <p className="text-xs font-medium text-stone-500">Total Extracted</p>
              <p className="text-2xl font-serif font-bold text-stone-900 mt-1">
                {summary.totalRecords}
              </p>
              <p className="text-[11px] text-stone-400 mt-0.5">Across all sheets</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm">
              <p className="text-xs font-medium text-emerald-700">Valid & Ready</p>
              <p className="text-2xl font-serif font-bold text-emerald-700 mt-1">
                {summary.validRecords}
              </p>
              <p className="text-[11px] text-stone-400 mt-0.5">Ready for import</p>
            </div>

            <div
              onClick={() => setPreviewFilter('needs_attention')}
              className={`p-4 rounded-xl border shadow-sm cursor-pointer transition-all ${
                previewFilter === 'needs_attention'
                  ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-400'
                  : 'bg-white border-stone-200 hover:border-amber-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-amber-700">Needs Attention</p>
                {summary.needsAttentionRecords > 0 && (
                  <AlertCircle className="w-4 h-4 text-amber-600 animate-pulse" />
                )}
              </div>
              <p className="text-2xl font-serif font-bold text-amber-700 mt-1">
                {summary.needsAttentionRecords}
              </p>
              <p className="text-[11px] text-stone-400 mt-0.5">Click to view & fix</p>
            </div>

            <div
              onClick={() => setPreviewFilter('existing_updates')}
              className={`p-4 rounded-xl border shadow-sm cursor-pointer transition-all ${
                previewFilter === 'existing_updates'
                  ? 'bg-purple-50 border-purple-300 ring-2 ring-purple-400'
                  : 'bg-white border-stone-200 hover:border-purple-300'
              }`}
            >
              <p className="text-xs font-medium text-purple-700">Existing Updates</p>
              <p className="text-2xl font-serif font-bold text-purple-700 mt-1">
                {summary.existingUpdatesCount || 0}
              </p>
              <p className="text-[11px] text-stone-400 mt-0.5">Approval required</p>
            </div>

            <div
              onClick={() => setPreviewFilter('third_party')}
              className={`p-4 rounded-xl border shadow-sm cursor-pointer transition-all ${
                previewFilter === 'third_party'
                  ? 'bg-sky-50 border-sky-300 ring-2 ring-sky-400'
                  : 'bg-white border-stone-200 hover:border-sky-300'
              }`}
            >
              <p className="text-xs font-medium text-sky-700">Third Party</p>
              <p className="text-2xl font-serif font-bold text-sky-700 mt-1">
                {summary.thirdPartyCount || 0}
              </p>
              <p className="text-[11px] text-stone-400 mt-0.5">Vendor workforce</p>
            </div>

            <div
              onClick={() => setPreviewFilter('historical_exits')}
              className={`p-4 rounded-xl border shadow-sm cursor-pointer transition-all ${
                previewFilter === 'historical_exits'
                  ? 'bg-stone-100 border-stone-400 ring-2 ring-stone-400'
                  : 'bg-white border-stone-200 hover:border-stone-400'
              }`}
            >
              <p className="text-xs font-medium text-stone-700">Historical Exits</p>
              <p className="text-2xl font-serif font-bold text-stone-800 mt-1">
                {summary.historicalExitsCount || 0}
              </p>
              <p className="text-[11px] text-stone-400 mt-0.5">Approval required</p>
            </div>
          </div>

          {/* Action Bar & Tabs */}
          <div className="bg-white rounded-xl border border-stone-200 p-4 shadow-sm space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              {/* Category Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
                <button
                  onClick={() => {
                    setPreviewFilter('all');
                    setPreviewPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    previewFilter === 'all'
                      ? 'bg-stone-900 text-white shadow-sm'
                      : 'bg-stone-50 text-stone-600 hover:bg-stone-100'
                  }`}
                >
                  All Records ({summary.totalRecords})
                </button>

                <button
                  onClick={() => {
                    setPreviewFilter('needs_attention');
                    setPreviewPage(1);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    previewFilter === 'needs_attention'
                      ? 'bg-amber-600 text-white shadow-sm font-semibold'
                      : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                  }`}
                >
                  {summary.needsAttentionRecords > 0 && <AlertCircle className="w-3.5 h-3.5" />}
                  Needs Attention ({summary.needsAttentionRecords})
                </button>

                <button
                  onClick={() => {
                    setPreviewFilter('valid');
                    setPreviewPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    previewFilter === 'valid'
                      ? 'bg-emerald-700 text-white shadow-sm'
                      : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                  }`}
                >
                  Valid & Ready ({summary.validRecords})
                </button>

                <button
                  onClick={() => {
                    setPreviewFilter('existing_updates');
                    setPreviewPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    previewFilter === 'existing_updates'
                      ? 'bg-purple-700 text-white shadow-sm'
                      : 'bg-purple-50 text-purple-800 hover:bg-purple-100'
                  }`}
                >
                  Existing Updates ({summary.existingUpdatesCount || 0})
                </button>

                <button
                  onClick={() => {
                    setPreviewFilter('third_party');
                    setPreviewPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    previewFilter === 'third_party'
                      ? 'bg-sky-700 text-white shadow-sm'
                      : 'bg-sky-50 text-sky-800 hover:bg-sky-100'
                  }`}
                >
                  Third Party ({summary.thirdPartyCount || 0})
                </button>

                <button
                  onClick={() => {
                    setPreviewFilter('historical_exits');
                    setPreviewPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    previewFilter === 'historical_exits'
                      ? 'bg-stone-800 text-white shadow-sm'
                      : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                  }`}
                >
                  Historical Exits ({summary.historicalExitsCount || 0})
                </button>
              </div>

              {/* Actions & Navigation */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentStep('sheets')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-700 bg-stone-50 hover:bg-stone-100 rounded-lg border border-stone-200 transition-colors"
                >
                  <Layers className="w-3.5 h-3.5 text-stone-500" />
                  <span>Choose Sheets ({selectedSheets.size}/{sheets.length})</span>
                </button>

                {summary.needsAttentionRecords > 0 && (
                  <button
                    onClick={handleDownloadErrors}
                    disabled={isDownloadingErrors}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 rounded-lg border border-amber-200 transition-colors"
                  >
                    {isDownloadingErrors ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    <span>Error Report</span>
                  </button>
                )}

                <button
                  onClick={() => setCurrentStep('commit')}
                  disabled={summary.validRecords === 0}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary/95 rounded-lg shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span>Proceed to Final Confirmation</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Search and Bulk Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-stone-100">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-stone-400" />
                <input
                  type="text"
                  placeholder="Search by code, name, email, department, location..."
                  value={previewSearch}
                  onChange={(e) => {
                    setPreviewSearch(e.target.value);
                    setPreviewPage(1);
                  }}
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-stone-200 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-stone-900"
                />
              </div>

              <div className="flex items-center gap-2 text-xs">
                {previewFilter === 'existing_updates' && (
                  <button
                    onClick={() => handleBulkApproval('existing_updates', true)}
                    className="px-2.5 py-1 text-purple-700 bg-purple-50 hover:bg-purple-100 rounded border border-purple-200 font-medium"
                  >
                    Approve All Updates
                  </button>
                )}

                {previewFilter === 'historical_exits' && (
                  <button
                    onClick={() => handleBulkApproval('historical_exits', true)}
                    className="px-2.5 py-1 text-stone-700 bg-stone-100 hover:bg-stone-200 rounded border border-stone-300 font-medium"
                  >
                    Approve All Historical Exits
                  </button>
                )}

                <span className="text-stone-500">Rows per page:</span>
                <select
                  value={previewLimit}
                  onChange={(e) => {
                    setPreviewLimit(Number(e.target.value));
                    setPreviewPage(1);
                  }}
                  className="px-2 py-1 bg-stone-50 border border-stone-200 rounded text-xs text-stone-700 focus:outline-none"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>
          </div>

          {/* Extracted Employee Table */}
          <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-stone-700">
                <thead className="bg-stone-50 border-b border-stone-200 font-medium text-stone-500 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3 px-3 w-10 text-center">Row</th>
                    <th className="py-3 px-3 w-12 text-center">Approve</th>
                    <th className="py-3 px-3">Employee Code</th>
                    <th className="py-3 px-3">Employee Name</th>
                    <th className="py-3 px-3">Email & Contact</th>
                    <th className="py-3 px-3">Department & Role</th>
                    <th className="py-3 px-3">Location</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Category</th>
                    <th className="py-3 px-3">Source</th>
                    <th className="py-3 px-3">Validation</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-stone-100">
                  {previewLoading ? (
                    <tr>
                      <td colSpan={12} className="py-12 text-center text-stone-400">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary mb-2" />
                        <span>Loading employee preview records...</span>
                      </td>
                    </tr>
                  ) : previewRows.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="py-12 text-center text-stone-400">
                        <FileSpreadsheet className="w-8 h-8 mx-auto text-stone-300 mb-2" />
                        <p className="font-medium text-stone-600">No records found matching your filter</p>
                        <p className="text-xs text-stone-400 mt-1">Try switching tabs or clearing your search query.</p>
                      </td>
                    </tr>
                  ) : (
                    previewRows.map((row) => {
                      const isRowEdited = row.isEdited;
                      const hasCriticalError = row.validationStatus !== 'VALID';
                      const isExisting = row.isExistingEmployee;

                      return (
                        <tr
                          key={row.rowIndex}
                          className={`hover:bg-stone-50/70 transition-colors ${
                            hasCriticalError
                              ? 'bg-amber-50/20'
                              : isExisting
                              ? 'bg-purple-50/20'
                              : ''
                          }`}
                        >
                          {/* Row Index */}
                          <td className="py-3 px-3 text-center text-stone-400 font-mono text-[11px]">
                            {row.rowIndex}
                          </td>

                          {/* Approval Checkbox / Indicator */}
                          <td className="py-3 px-3 text-center">
                            {row.validationStatus === 'VALID' ? (
                              <button
                                type="button"
                                onClick={() => handleToggleApproval(row)}
                                title={row.approvedForImport ? 'Approved for import' : 'Click to approve'}
                                className="p-1 hover:bg-stone-100 rounded text-stone-600 transition-colors"
                              >
                                {row.approvedForImport ? (
                                  <CheckSquare className="w-4 h-4 text-primary" />
                                ) : (
                                  <Square className="w-4 h-4 text-stone-300" />
                                )}
                              </button>
                            ) : (
                              <span title="Resolve validation issues to approve">
                                <Square className="w-4 h-4 text-stone-200 mx-auto cursor-not-allowed" />
                              </span>
                            )}
                          </td>

                          {/* Employee Code */}
                          <td className="py-3 px-3 font-mono font-medium text-stone-900">
                            {row.mappedData.employeeCode ? (
                              <span className="px-1.5 py-0.5 rounded bg-stone-100 border border-stone-200 text-stone-800">
                                {row.mappedData.employeeCode}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-red-600 font-sans text-xs font-semibold">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                Missing Code
                              </span>
                            )}
                          </td>

                          {/* Employee Name */}
                          <td className="py-3 px-3 font-medium text-stone-900">
                            {inlineEditingRowId === row.rowIndex && inlineEditField === 'fullName' ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={inlineEditValue}
                                  onChange={(e) => setInlineEditValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveInlineEdit(row);
                                    if (e.key === 'Escape') cancelInlineEdit();
                                  }}
                                  className="px-2 py-1 text-xs border border-primary rounded focus:outline-none w-36"
                                  autoFocus
                                />
                                <button
                                  onClick={() => saveInlineEdit(row)}
                                  className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                                >
                                  <Check className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={cancelInlineEdit}
                                  className="p-1 text-stone-400 hover:bg-stone-100 rounded"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <div
                                onDoubleClick={() => startInlineEdit(row, 'fullName')}
                                className="group flex items-center gap-1 cursor-pointer"
                              >
                                <span>{row.mappedData.fullName || '—'}</span>
                                <Pencil className="w-3 h-3 text-stone-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                            )}
                          </td>

                          {/* Email & Contact */}
                          <td className="py-3 px-3 text-stone-600">
                            <div>{row.mappedData.workEmail || row.mappedData.personalEmail || '—'}</div>
                            {row.mappedData.phone && (
                              <div className="text-[11px] text-stone-400 font-mono">
                                {row.mappedData.phone}
                              </div>
                            )}
                          </td>

                          {/* Department & Role */}
                          <td className="py-3 px-3 text-stone-600">
                            <div className="font-medium text-stone-800">
                              {row.mappedData.department || '—'}
                            </div>
                            <div className="text-[11px] text-stone-400">
                              {row.mappedData.designation || '—'}
                            </div>
                          </td>

                          {/* Location */}
                          <td className="py-3 px-3 text-stone-600">
                            {row.mappedData.workLocation || '—'}
                          </td>

                          {/* Lifecycle Status with Click-to-Inspect */}
                          <td className="py-3 px-3">
                            <button
                              type="button"
                              onClick={() => setLifecycleInspectorRow(row)}
                              className="group inline-flex items-center gap-1 cursor-pointer transition-transform hover:scale-105 focus:outline-none"
                              title="Click to inspect lifecycle reasoning & history"
                            >
                              {getStatusBadge(row.mappedData.employmentStatus)}
                              <Info className="w-3 h-3 text-stone-400 group-hover:text-primary transition-colors" />
                            </button>
                          </td>

                          {/* Category */}
                          <td className="py-3 px-3">
                            {getReconciliationBadge(row)}
                          </td>

                          {/* Source Sheet & Row */}
                          <td className="py-3 px-3">
                            <div className="space-y-0.5">
                              <span className="inline-block px-1.5 py-0.5 text-[10px] rounded bg-stone-100 text-stone-700 font-medium border border-stone-200">
                                {row.primarySheet || row.sourceSheets?.[0] || '—'}
                              </span>
                              {row.sourceRowNumber && (
                                <p className="text-[10px] text-stone-400 font-mono">
                                  Row {row.sourceRowNumber}
                                </p>
                              )}
                            </div>
                          </td>

                          {/* Validation Status */}
                          <td className="py-3 px-3">
                            <div className="space-y-1">
                              {row.validationStatus === 'VALID' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Valid
                                </span>
                              ) : row.validationStatus === 'DUPLICATE' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700">
                                  <AlertCircle className="w-3 h-3" />
                                  Duplicate Code
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-800">
                                  <AlertTriangle className="w-3 h-3" />
                                  Needs Attention
                                </span>
                              )}

                              {isRowEdited && (
                                <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                                  <span>Manually Edited</span>
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              {/* Edit Modal Button */}
                              <button
                                onClick={() => openFullEditModal(row)}
                                className="p-1.5 hover:bg-stone-100 text-stone-600 hover:text-stone-900 rounded-lg transition-colors"
                                title="Edit employee record"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>

                              {/* Diff Comparison Button for existing employee */}
                              {row.isExistingEmployee && (
                                <button
                                  onClick={() => setDiffModalRow(row)}
                                  className="p-1.5 hover:bg-purple-50 text-purple-600 rounded-lg transition-colors"
                                  title="Compare proposed changes with existing database employee"
                                >
                                  <GitCompare className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {/* Revert Button if manually edited */}
                              {isRowEdited && (
                                <button
                                  onClick={() => handleRevertRow(row)}
                                  className="p-1.5 hover:bg-stone-100 text-stone-500 hover:text-stone-800 rounded-lg transition-colors"
                                  title="Revert to original Excel extracted data"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {/* Delete Row Button */}
                              <button
                                onClick={() => handleDeleteRow(row)}
                                className="p-1.5 hover:bg-red-50 text-stone-400 hover:text-red-600 rounded-lg transition-colors"
                                title="Remove row from import"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="p-4 bg-stone-50/70 border-t border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-stone-500">
              <div>
                Showing{' '}
                <span className="font-semibold text-stone-800">
                  {totalFiltered > 0 ? (previewPage - 1) * previewLimit + 1 : 0}
                </span>{' '}
                to{' '}
                <span className="font-semibold text-stone-800">
                  {Math.min(previewPage * previewLimit, totalFiltered)}
                </span>{' '}
                of <span className="font-semibold text-stone-800">{totalFiltered}</span> filtered records (total {summary.totalRecords} in workbook)
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                  disabled={previewPage <= 1}
                  className="px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium flex items-center gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Previous</span>
                </button>

                <span className="font-medium text-stone-700 px-2">
                  Page {previewPage} of {totalPages}
                </span>

                <button
                  onClick={() => setPreviewPage((p) => Math.min(totalPages, p + 1))}
                  disabled={previewPage >= totalPages}
                  className="px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium flex items-center gap-1"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STAGE 3: FINAL IMPORT CONFIRMATION                                        */}
      {/* ========================================================================= */}
      {currentStep === 'commit' && (
        <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-8 space-y-6">
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-serif font-bold text-stone-900">
                Confirm Employee Import
              </h2>
              <p className="text-stone-500 text-sm">
                Review the finalized import summary below before applying changes to your workspace database.
              </p>
            </div>

            {/* Approval Breakdown Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-stone-200 bg-stone-50/50 space-y-1">
                <p className="text-xs font-semibold text-stone-700 uppercase tracking-wider">
                  New Regular Employees
                </p>
                <p className="text-2xl font-bold text-stone-900">
                  {summary.validRecords - (summary.thirdPartyCount || 0) - (summary.existingUpdatesCount || 0)}
                </p>
                <p className="text-xs text-stone-500">Will be created in permanent staff roster</p>
              </div>

              <div className="p-4 rounded-xl border border-sky-200 bg-sky-50/30 space-y-1">
                <p className="text-xs font-semibold text-sky-800 uppercase tracking-wider">
                  Third Party Workforce
                </p>
                <p className="text-2xl font-bold text-sky-800">
                  {summary.thirdPartyCount || 0}
                </p>
                <p className="text-xs text-stone-500">Maintained with contractor vendor references</p>
              </div>

              <div className="p-4 rounded-xl border border-purple-200 bg-purple-50/30 space-y-1">
                <p className="text-xs font-semibold text-purple-800 uppercase tracking-wider">
                  Approved Existing Updates
                </p>
                <p className="text-2xl font-bold text-purple-800">
                  {summary.existingUpdatesCount || 0}
                </p>
                <p className="text-xs text-stone-500">Will update existing employee records in PostgreSQL</p>
              </div>

              <div className="p-4 rounded-xl border border-stone-300 bg-stone-100/50 space-y-1">
                <p className="text-xs font-semibold text-stone-800 uppercase tracking-wider">
                  Approved Historical Exits
                </p>
                <p className="text-2xl font-bold text-stone-900">
                  {summary.historicalExitsCount || 0}
                </p>
                <p className="text-xs text-stone-500">Created with verified past departure dates</p>
              </div>
            </div>

            {/* Warning for skipped records */}
            {summary.needsAttentionRecords > 0 && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs text-amber-800">
                  <p className="font-semibold">
                    {summary.needsAttentionRecords} records require attention and will be skipped.
                  </p>
                  <p>
                    Only valid and approved records will be imported into PostgreSQL. You can return
                    to the review table to fix missing employee codes, emails, or date formats.
                  </p>
                </div>
              </div>
            )}

            <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-600 space-y-2">
              <div className="flex items-center gap-2 font-medium text-stone-800">
                <Check className="w-4 h-4 text-emerald-600" />
                <span>Zero auto-generated human Employee Codes applied.</span>
              </div>
              <div className="flex items-center gap-2 font-medium text-stone-800">
                <Check className="w-4 h-4 text-emerald-600" />
                <span>Tenant isolation and RLS boundaries strictly maintained.</span>
              </div>
              <div className="flex items-center gap-2 font-medium text-stone-800">
                <Check className="w-4 h-4 text-emerald-600" />
                <span>Temporary memory session will be cleared upon completion.</span>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setCurrentStep('preview')}
                className="px-4 py-2 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 text-xs font-medium transition-colors flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Review & Edit</span>
              </button>

              <button
                type="button"
                onClick={handleCommitImport}
                disabled={commitMutation.isPending || summary.validRecords === 0}
                className="px-6 py-2.5 rounded-lg bg-primary hover:bg-primary/95 text-white text-xs font-semibold shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {commitMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Confirm & Import Records</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* COMPLETION STATE                                                         */}
      {/* ========================================================================= */}
      {currentStep === 'complete' && commitResult && (
        <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-8 text-center space-y-6">
          <div className="max-w-md mx-auto space-y-6">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-serif font-bold text-stone-900">
                Import Successfully Completed!
              </h2>
              <p className="text-stone-500 text-sm">
                Your employee records have been safely imported and synchronized with your workspace database.
              </p>
            </div>

            <div className="p-4 bg-stone-50 rounded-xl border border-stone-200 grid grid-cols-2 gap-4 text-left">
              <div>
                <p className="text-xs text-stone-400">Employees Processed</p>
                <p className="text-lg font-bold text-stone-900">{commitResult.totalProcessed}</p>
              </div>
              <div>
                <p className="text-xs text-emerald-600 font-medium">Successfully Imported</p>
                <p className="text-lg font-bold text-emerald-700">{commitResult.importedCount}</p>
              </div>
              <div>
                <p className="text-xs text-stone-400">Skipped Records</p>
                <p className="text-lg font-bold text-stone-700">{commitResult.skippedCount}</p>
              </div>
              <div>
                <p className="text-xs text-stone-400">Duplicate Codes Handled</p>
                <p className="text-lg font-bold text-stone-700">{commitResult.duplicateCount}</p>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setLocation('/employees')}
                className="px-5 py-2.5 rounded-lg bg-primary hover:bg-primary/95 text-white text-xs font-semibold shadow-sm transition-colors"
              >
                View Employee Directory
              </button>

              <button
                type="button"
                onClick={() => {
                  setUploadData(null);
                  setSheets([]);
                  setCommitResult(null);
                  setCurrentStep('upload');
                }}
                className="px-4 py-2.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 text-xs font-medium transition-colors"
              >
                Import Another File
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: FULL EDIT EMPLOYEE DIALOG                                        */}
      {/* ========================================================================= */}
      <Dialog open={Boolean(editingRow)} onOpenChange={(open) => !open && setEditingRow(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl text-stone-900 flex items-center justify-between">
              <span>Edit Extracted Employee Record</span>
              {editingRow && (
                <span className="text-xs font-mono font-normal text-stone-400">
                  Excel Row {editingRow.rowIndex}
                </span>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs text-stone-500">
              Modifications are saved to this import session only. PostgreSQL records will update upon final confirmation.
            </DialogDescription>
          </DialogHeader>

          {editingRow && (
            <div className="space-y-4 pt-2">
              {/* Validation Warning Banner if record has errors */}
              {editingRow.errors && editingRow.errors.length > 0 && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 space-y-1">
                  <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Validation Issues Requiring Attention:
                  </p>
                  <ul className="list-disc list-inside text-xs text-amber-700 space-y-0.5">
                    {editingRow.errors.map((e, idx) => (
                      <li key={idx}>
                        <span className="font-medium">{e.field}:</span> {e.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Grid Form */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                {/* Employee Code */}
                <div>
                  <label className="block font-medium text-stone-700 mb-1">
                    Employee ID / Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editFormData.employeeCode || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, employeeCode: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-stone-900"
                    placeholder="e.g. EMP-1001"
                  />
                  <p className="text-[10px] text-stone-400 mt-1">Never auto-generated. Must be company provided.</p>
                </div>

                {/* Full Name */}
                <div>
                  <label className="block font-medium text-stone-700 mb-1">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editFormData.fullName || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, fullName: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-stone-900"
                    placeholder="e.g. Diya Sharma"
                  />
                </div>

                {/* Work Email */}
                <div>
                  <label className="block font-medium text-stone-700 mb-1">Work Email</label>
                  <input
                    type="email"
                    value={editFormData.workEmail || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, workEmail: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-stone-900"
                    placeholder="e.g. diya.sharma@example.test"
                  />
                </div>

                {/* Personal Email */}
                <div>
                  <label className="block font-medium text-stone-700 mb-1">Personal Email</label>
                  <input
                    type="email"
                    value={editFormData.personalEmail || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, personalEmail: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-stone-900"
                    placeholder="e.g. diya.personal@gmail.com"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block font-medium text-stone-700 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    value={editFormData.phone || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-stone-900"
                    placeholder="e.g. 9876501002"
                  />
                </div>

                {/* Location */}
                <div>
                  <label className="block font-medium text-stone-700 mb-1">Work Location / Site</label>
                  <input
                    type="text"
                    value={editFormData.workLocation || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, workLocation: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-stone-900"
                    placeholder="e.g. Lucknow, Noida, Delhi"
                  />
                </div>

                {/* Department */}
                <div>
                  <label className="block font-medium text-stone-700 mb-1">Department</label>
                  <input
                    type="text"
                    value={editFormData.department || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, department: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-stone-900"
                    placeholder="e.g. Technology, Finance, Human Resources"
                  />
                </div>

                {/* Designation */}
                <div>
                  <label className="block font-medium text-stone-700 mb-1">Designation / Role</label>
                  <input
                    type="text"
                    value={editFormData.designation || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, designation: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-stone-900"
                    placeholder="e.g. Software Engineer, Analyst"
                  />
                </div>

                {/* Category */}
                <div>
                  <label className="block font-medium text-stone-700 mb-1">Employment Category</label>
                  <AnimatedSelect
                    value={editCategory}
                    options={CATEGORY_OPTIONS}
                    onChange={(val) => setEditCategory(val as any)}
                  />
                </div>

                {/* Vendor if Third-Party */}
                {editCategory === 'THIRD_PARTY' && (
                  <div>
                    <label className="block font-medium text-stone-700 mb-1">Vendor / Staffing Agency</label>
                    <input
                      type="text"
                      value={editVendor}
                      onChange={(e) => setEditVendor(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-stone-200 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-stone-900"
                      placeholder="e.g. SecureCo, CleanPro"
                    />
                  </div>
                )}

                {/* Lifecycle Status */}
                <div>
                  <label className="block font-medium text-stone-700 mb-1">Lifecycle Status</label>
                  <AnimatedSelect
                    value={editFormData.employmentStatus || 'ACTIVE'}
                    options={LIFECYCLE_OPTIONS}
                    onChange={(val) =>
                      setEditFormData({
                        ...editFormData,
                        employmentStatus: val as any,
                      })
                    }
                  />
                </div>

                {/* Date of Joining */}
                <div>
                  <label className="block font-medium text-stone-700 mb-1">
                    Date of Joining (DOJ) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={editFormData.hireDate || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, hireDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-stone-900"
                  />
                </div>

                {/* Last Working Day (Mandatory for Offboarding / Exited) */}
                <div>
                  <label className="block font-medium text-stone-700 mb-1">
                    Last Working Day (LWD)
                    {(editFormData.employmentStatus === 'OFFBOARDING' ||
                      editFormData.employmentStatus === 'EXITED') && (
                      <span className="text-red-500 font-semibold ml-1">* Mandatory</span>
                    )}
                  </label>
                  <input
                    type="date"
                    value={editFormData.lastWorkingDay || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, lastWorkingDay: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-stone-900"
                  />
                </div>

                {/* Exit Reason */}
                <div>
                  <label className="block font-medium text-stone-700 mb-1">Reason for Leaving</label>
                  <input
                    type="text"
                    value={editFormData.exitReason || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, exitReason: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-stone-900"
                    placeholder="e.g. Better opportunity, Relocation"
                  />
                </div>
              </div>

              {/* Handover & Exit Notes */}
              <div>
                <label className="block font-medium text-stone-700 mb-1 text-xs">Handover & Exit Notes</label>
                <textarea
                  value={editFormData.exitNotes || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, exitNotes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-stone-200 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-stone-900 text-xs"
                  placeholder="Additional transition remarks or handover documentation links..."
                />
              </div>

              {/* Dialog Actions */}
              <div className="flex items-center justify-between pt-4 border-t border-stone-100">
                {editingRow.isEdited ? (
                  <button
                    type="button"
                    onClick={() => handleRevertRow(editingRow)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-600 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Revert to Original Extracted</span>
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingRow(null)}
                    className="px-3 py-1.5 text-xs font-medium text-stone-600 hover:text-stone-900 bg-stone-50 hover:bg-stone-100 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={saveFullEditModal}
                    disabled={updateRowMutation.isPending}
                    className="px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary/95 rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
                  >
                    {updateRowMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>Save & Revalidate</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL 2: EXISTING EMPLOYEE SIDE-BY-SIDE COMPARISON MODAL                 */}
      {/* ========================================================================= */}
      <Dialog open={Boolean(diffModalRow)} onOpenChange={(open) => !open && setDiffModalRow(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg text-stone-900 flex items-center gap-2">
              <GitCompare className="w-5 h-5 text-purple-600" />
              <span>Existing Employee Comparison</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-stone-500">
              Matches existing record for employee code{' '}
              <span className="font-mono font-bold text-stone-800">
                {diffModalRow?.mappedData.employeeCode}
              </span>
              . Review proposed changes below.
            </DialogDescription>
          </DialogHeader>

          {diffModalRow && diffModalRow.existingDbData && (
            <div className="space-y-4 pt-2">
              <div className="border border-stone-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 uppercase font-semibold text-[11px]">
                    <tr>
                      <th className="py-2.5 px-3">Field</th>
                      <th className="py-2.5 px-3">Existing in Database</th>
                      <th className="py-2.5 px-3 text-purple-700">Proposed in Excel</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    <tr>
                      <td className="py-2 px-3 font-medium text-stone-700">Employee Name</td>
                      <td className="py-2 px-3 text-stone-600">
                        {String(diffModalRow.existingDbData.fullName || '—')}
                      </td>
                      <td className="py-2 px-3 text-stone-900 font-medium">
                        {diffModalRow.mappedData.fullName}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-medium text-stone-700">Department</td>
                      <td className="py-2 px-3 text-stone-600">
                        {String(diffModalRow.existingDbData.department || '—')}
                      </td>
                      <td
                        className={`py-2 px-3 font-medium ${
                          diffModalRow.fieldDiffs?.some((d) => d.field === 'department')
                            ? 'text-purple-700 bg-purple-50/50 font-bold'
                            : 'text-stone-900'
                        }`}
                      >
                        {diffModalRow.mappedData.department || '—'}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-medium text-stone-700">Designation / Role</td>
                      <td className="py-2 px-3 text-stone-600">
                        {String(diffModalRow.existingDbData.designation || '—')}
                      </td>
                      <td
                        className={`py-2 px-3 font-medium ${
                          diffModalRow.fieldDiffs?.some((d) => d.field === 'designation')
                            ? 'text-purple-700 bg-purple-50/50 font-bold'
                            : 'text-stone-900'
                        }`}
                      >
                        {diffModalRow.mappedData.designation || '—'}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-medium text-stone-700">Lifecycle Status</td>
                      <td className="py-2 px-3 text-stone-600">
                        {String(diffModalRow.existingDbData.employmentStatus || '—')}
                      </td>
                      <td
                        className={`py-2 px-3 font-medium ${
                          diffModalRow.fieldDiffs?.some((d) => d.field === 'employmentStatus')
                            ? 'text-purple-700 bg-purple-50/50 font-bold'
                            : 'text-stone-900'
                        }`}
                      >
                        {diffModalRow.mappedData.employmentStatus}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-medium text-stone-700">Last Working Day</td>
                      <td className="py-2 px-3 text-stone-600">
                        {String(diffModalRow.existingDbData.lastWorkingDay || 'None')}
                      </td>
                      <td
                        className={`py-2 px-3 font-medium ${
                          diffModalRow.fieldDiffs?.some((d) => d.field === 'lastWorkingDay')
                            ? 'text-purple-700 bg-purple-50/50 font-bold'
                            : 'text-stone-900'
                        }`}
                      >
                        {diffModalRow.mappedData.lastWorkingDay || 'None'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setDiffModalRow(null)}
                  className="px-3 py-1.5 text-xs text-stone-600 hover:text-stone-900 bg-stone-50 hover:bg-stone-100 rounded-lg"
                >
                  Close
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    await handleToggleApproval(diffModalRow);
                    setDiffModalRow(null);
                  }}
                  className={`px-4 py-2 text-xs font-semibold rounded-lg shadow-sm flex items-center gap-1.5 transition-colors ${
                    diffModalRow.approvedForImport
                      ? 'bg-stone-200 text-stone-800 hover:bg-stone-300'
                      : 'bg-purple-700 text-white hover:bg-purple-800'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>
                    {diffModalRow.approvedForImport ? 'Approved (Click to Unapprove)' : 'Approve Proposed Changes'}
                  </span>
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL 3: WORKSHEET INSPECTOR MODAL                                        */}
      {/* ========================================================================= */}
      <Dialog open={sheetInspectorOpen} onOpenChange={setSheetInspectorOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg text-stone-900 flex items-center gap-2">
              <Layers className="w-5 h-5 text-primary" />
              <span>Detected Worksheets in Workbook</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-stone-500">
              Worksheet classification is performed automatically behind the scenes. Review detected sheets below.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2 text-xs">
            {sheets.map((s, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                  s.importable
                    ? 'bg-white border-stone-200'
                    : 'bg-stone-50 border-stone-200 opacity-60'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-stone-900 text-sm">{s.sheetName}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                        s.importable
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-stone-200 text-stone-600'
                      }`}
                    >
                      {s.categoryLabel}
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-500">
                    Header Row: {s.headerRowIndex} | Columns: {s.columnCount} | Rows: {s.estimatedDataRows}
                  </p>
                  <p className="text-[10px] text-stone-400 font-mono truncate max-w-md">
                    Headers: {s.detectedHeaders.join(', ')}
                  </p>
                </div>

                <div className="text-right">
                  <span
                    className={`text-[11px] font-medium px-2 py-1 rounded ${
                      s.importable
                        ? 'text-emerald-700 bg-emerald-50'
                        : 'text-stone-400 bg-stone-100'
                    }`}
                  >
                    {s.importable ? 'Reconciled' : 'Ignored'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL 4: IMPORT HISTORY MODAL                                             */}
      {/* ========================================================================= */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg text-stone-900 flex items-center gap-2">
              <History className="w-5 h-5 text-primary" />
              <span>Workspace Import History</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-stone-500">
              Audit log of all past employee batch imports performed in this workspace.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2 text-xs">
            {historyLoading ? (
              <div className="py-8 text-center text-stone-400">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary mb-2" />
                <span>Loading import history...</span>
              </div>
            ) : importHistory.length === 0 ? (
              <div className="py-8 text-center text-stone-400">
                No past imports found for this workspace.
              </div>
            ) : (
              importHistory.map((h) => (
                <div
                  key={h.id}
                  className="p-3 rounded-xl border border-stone-200 bg-white flex items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <p className="font-semibold text-stone-900">{h.filename}</p>
                    <p className="text-[11px] text-stone-400">
                      {new Date(h.uploadedAt).toLocaleString()}
                    </p>
                    <div className="flex items-center gap-3 text-[11px] text-stone-600">
                      <span>Total: {h.totalRecords}</span>
                      <span className="text-emerald-700 font-medium">Imported: {h.importedRecords}</span>
                      <span>Skipped: {h.skippedRecords}</span>
                      <span>Duplicates: {h.duplicateRecords}</span>
                    </div>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      h.status === 'COMPLETED'
                        ? 'bg-emerald-50 text-emerald-700'
                        : h.status === 'PARTIAL'
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-red-50 text-red-700'
                    }`}
                  >
                    {h.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL 5: LIFECYCLE INSPECTOR MODAL                                        */}
      {/* ========================================================================= */}
      <Dialog
        open={Boolean(lifecycleInspectorRow)}
        onOpenChange={(open) => !open && setLifecycleInspectorRow(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg text-stone-900 flex items-center gap-2">
              <Info className="w-5 h-5 text-primary" />
              <span>Lifecycle Intelligence Inspector</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-stone-500">
              Complete audit trail of how People Journey determined this employee's lifecycle status.
            </DialogDescription>
          </DialogHeader>

          {lifecycleInspectorRow && (
            <div className="space-y-4 pt-2 text-xs">
              {/* Employee Summary Card */}
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-stone-900 text-sm">
                    {lifecycleInspectorRow.mappedData.fullName || 'Unnamed Employee'}
                  </p>
                  <p className="text-stone-500 font-mono text-[11px]">
                    Code: {lifecycleInspectorRow.mappedData.employeeCode || 'Missing'} • {lifecycleInspectorRow.mappedData.department || 'No Department'}
                  </p>
                </div>
                <div>
                  {getStatusBadge(lifecycleInspectorRow.mappedData.employmentStatus)}
                </div>
              </div>

              {/* Lifecycle Audit Details */}
              <div className="border border-stone-200 rounded-xl overflow-hidden divide-y divide-stone-100">
                <div className="p-3 bg-white flex justify-between items-center">
                  <span className="text-stone-500 font-medium">Original Excel Status:</span>
                  <span className="font-mono font-semibold text-stone-800 bg-stone-100 px-2 py-0.5 rounded">
                    {lifecycleInspectorRow.rawExcelStatus || 'Not specified'}
                  </span>
                </div>

                <div className="p-3 bg-white flex justify-between items-center">
                  <span className="text-stone-500 font-medium">Detected Lifecycle:</span>
                  <span className="font-semibold text-stone-900">
                    {lifecycleInspectorRow.mappedData.employmentStatus}
                  </span>
                </div>

                <div className="p-3 bg-white flex justify-between items-center">
                  <span className="text-stone-500 font-medium">Source Worksheet & Row:</span>
                  <span className="text-stone-800 font-medium">
                    {lifecycleInspectorRow.primarySheet || lifecycleInspectorRow.sourceSheets?.[0] || 'Unknown'}
                    {lifecycleInspectorRow.sourceRowNumber ? ` (Row ${lifecycleInspectorRow.sourceRowNumber})` : ''}
                  </span>
                </div>

                {lifecycleInspectorRow.supportingDates && (
                  <div className="p-3 bg-white space-y-1.5">
                    <span className="text-stone-500 font-medium block">Supporting Dates:</span>
                    <div className="grid grid-cols-2 gap-2 text-[11px] bg-stone-50 p-2.5 rounded-lg border border-stone-200">
                      <div>
                        <span className="text-stone-400">Date of Joining (DOJ):</span>
                        <p className="font-medium text-stone-700">{lifecycleInspectorRow.supportingDates.hireDate || '—'}</p>
                      </div>
                      <div>
                        <span className="text-stone-400">Resignation Date:</span>
                        <p className="font-medium text-stone-700">{lifecycleInspectorRow.supportingDates.resignationDate || '—'}</p>
                      </div>
                      <div className="col-span-2">
                        <span className="text-stone-400">Last Working Day (LWD):</span>
                        <p className="font-medium text-stone-700 flex items-center gap-1.5">
                          {lifecycleInspectorRow.supportingDates.lastWorkingDay || '—'}
                          {lifecycleInspectorRow.supportingDates.isPastLwd && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-stone-200 text-stone-700">Past LWD</span>
                          )}
                          {lifecycleInspectorRow.supportingDates.isFutureLwd && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">Future LWD</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="p-3 bg-white space-y-1">
                  <span className="text-stone-500 font-medium block">Classification Reasoning:</span>
                  <p className="text-stone-700 bg-stone-50 p-2.5 rounded-lg border border-stone-200 leading-relaxed">
                    {lifecycleInspectorRow.lifecycleReason || 'Classified based on standard roster mapping.'}
                  </p>
                </div>

                {lifecycleInspectorRow.conflicts && lifecycleInspectorRow.conflicts.length > 0 && (
                  <div className="p-3 bg-white space-y-1.5">
                    <span className="text-amber-800 font-medium flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      Resolved Cross-Sheet Conflicts:
                    </span>
                    <div className="space-y-1 bg-amber-50/60 p-2.5 rounded-lg border border-amber-200">
                      {lifecycleInspectorRow.conflicts.map((c, i) => (
                        <p key={i} className="text-[11px] text-amber-900">
                          • <span className="font-semibold">{c.sheet}</span> ({c.field}): {c.conflictDescription}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setLifecycleInspectorRow(null)}
                  className="px-4 py-2 text-xs font-semibold text-white bg-stone-800 hover:bg-stone-900 rounded-lg transition-colors"
                >
                  Close Inspector
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
