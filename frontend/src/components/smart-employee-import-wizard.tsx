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
} from 'lucide-react';
import {
  useUploadImportFile,
  useUpdateSheetHeader,
  useUpdateSheetConfig,
  useValidateMultiSheetMapping,
  useImportPreview,
  useUpdatePreviewRow,
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
} from '@/types/api';

type WizardStep = 'upload' | 'sheets' | 'mapping' | 'preview' | 'commit' | 'complete';

const SHEET_CATEGORY_OPTIONS: SelectOption[] = [
  { value: 'REGULAR_EMPLOYEES', label: 'Regular Employees', subtext: 'Primary workforce roster' },
  { value: 'THIRD_PARTY', label: 'Third Party Workforce', subtext: 'Contractors, agency staff (Worker Ref)' },
  { value: 'RESIGNATION_TRACKER', label: 'Lifecycle Updates / Exits', subtext: 'LWD, resignation dates, departures' },
  { value: 'RETENTION_TRACKER', label: 'Employee Restoration', subtext: 'Resignation withdrawals (restores Active)' },
  { value: 'TRANSFER', label: 'Employee Location Updates', subtext: 'Site & office relocations' },
  { value: 'IGNORE', label: 'Ignore Sheet', subtext: 'Do not import this sheet' },
];

export function SmartEmployeeImportWizard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Wizard Navigation
  const [currentStep, setCurrentStep] = useState<WizardStep>('upload');
  const [historyOpen, setHistoryOpen] = useState(false);

  // Session & Multi-Sheet State
  const [uploadData, setUploadData] = useState<UploadExcelResponse | null>(null);
  const [sheets, setSheets] = useState<SheetSessionData[]>([]);
  const [activeSheetName, setActiveSheetName] = useState<string>('');
  const [sheetMappings, setSheetMappings] = useState<Record<string, Record<string, string>>>({});
  const [saveWorkspaceMapping, setSaveWorkspaceMapping] = useState(true);

  // Header Row Selection Modal
  const [headerModalSheet, setHeaderModalSheet] = useState<SheetSessionData | null>(null);

  // Preview Pagination & Filter State
  const [previewFilter, setPreviewFilter] = useState<'all' | 'needs_attention' | 'valid' | 'duplicates'>('all');
  const [previewSearch, setPreviewSearch] = useState('');
  const [previewPage, setPreviewPage] = useState(1);
  const [previewLimit, setPreviewLimit] = useState(10);

  // Row Edit Modal State
  const [editingRow, setEditingRow] = useState<ValidatedImportRow | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<ValidatedImportRow['mappedData']>>({});

  // Import Commit Result
  const [commitResult, setCommitResult] = useState<{
    importedCount: number;
    skippedCount: number;
    errorCount: number;
    duplicateCount: number;
    statusBreakdown: Record<string, number>;
  } | null>(null);

  // Mutations & Queries
  const uploadMutation = useUploadImportFile();
  const updateSheetHeaderMutation = useUpdateSheetHeader();
  const updateSheetConfigMutation = useUpdateSheetConfig();
  const validateMultiMutation = useValidateMultiSheetMapping();
  const updateRowMutation = useUpdatePreviewRow();
  const deleteRowMutation = useDeletePreviewRow();
  const commitMutation = useCommitImport();
  const { data: importHistory = [], isLoading: historyLoading } = useImportHistory();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const [isDownloadingErrors, setIsDownloadingErrors] = useState(false);

  const sessionId = uploadData?.sessionId || null;
  const { data: previewData, isLoading: previewLoading, refetch: refetchPreview } = useImportPreview(sessionId, {
    page: previewPage,
    limit: previewLimit,
    filter: previewFilter,
    search: previewSearch,
  });

  // Canonical field definitions
  const canonicalFields = uploadData?.canonicalFields || [];

  // Active sheets that are marked importable
  const importableSheets = useMemo(() => {
    return sheets.filter((s) => s.importable && s.category !== 'IGNORE');
  }, [sheets]);

  // Current active sheet for column mapping
  const activeSheet = useMemo(() => {
    return sheets.find((s) => s.sheetName === activeSheetName) || importableSheets[0] || sheets[0];
  }, [sheets, activeSheetName, importableSheets]);

  // AnimatedSelect options for Column Mapping
  const columnSelectOptions: SelectOption[] = useMemo(() => {
    const unmappedOption: SelectOption = {
      value: '',
      label: '— Do not import this column —',
      subtext: 'Ignore values in this column',
    };

    const fieldOptions: SelectOption[] = canonicalFields.map((f) => ({
      value: f.field,
      label: f.label,
      badge: f.required ? 'Required' : undefined,
      subtext: f.description,
    }));

    return [unmappedOption, ...fieldOptions];
  }, [canonicalFields]);

  // =========================================================================
  // Step 1: File Upload Handlers
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
        const incomingSheets = res.sheets || [];
        setSheets(incomingSheets);

        // Pre-fill initial per-sheet mappings
        const initialMappings: Record<string, Record<string, string>> = {};
        incomingSheets.forEach((s) => {
          initialMappings[s.sheetName] = s.columnMapping || {};
        });
        setSheetMappings(initialMappings);

        // Set default active sheet
        const firstImportable = incomingSheets.find((s) => s.importable && s.category === 'REGULAR_EMPLOYEES') ||
          incomingSheets.find((s) => s.importable) ||
          incomingSheets[0];
        if (firstImportable) {
          setActiveSheetName(firstImportable.sheetName);
        }

        // Navigate to Step 2: Sheet Detection if workbook has multiple sheets, else Column Mapping
        if (incomingSheets.length > 1) {
          setCurrentStep('sheets');
          toast({
            title: 'Workbook Analyzed',
            description: `Detected ${incomingSheets.length} worksheets. Please review classifications below.`,
          });
        } else {
          setCurrentStep('mapping');
          toast({
            title: 'Excel File Parsed',
            description: `Detected ${res.detection.detectedHeaders.length} columns and ${res.totalRows} data rows.`,
          });
        }
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
  // Step 2: Sheet Detection Handlers
  // =========================================================================

  const handleSheetCategoryChange = async (sheetName: string, category: SheetCategory) => {
    if (!sessionId) return;
    const isImportable = category !== 'IGNORE';
    try {
      const res = await updateSheetConfigMutation.mutateAsync({
        sessionId,
        sheetName,
        category,
        importable: isImportable,
      });

      setSheets((prev) => prev.map((s) => (s.sheetName === sheetName ? res.sheet : s)));
      toast({
        title: 'Sheet Updated',
        description: `"${sheetName}" classified as ${res.sheet.categoryLabel}.`,
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: (err as Error).message || 'Failed to update sheet classification.',
      });
    }
  };

  const handleToggleSheetImport = async (sheetName: string, importable: boolean) => {
    if (!sessionId) return;
    const sheet = sheets.find((s) => s.sheetName === sheetName);
    if (!sheet) return;

    try {
      const category = !importable ? 'IGNORE' : sheet.category === 'IGNORE' ? 'REGULAR_EMPLOYEES' : sheet.category;
      const res = await updateSheetConfigMutation.mutateAsync({
        sessionId,
        sheetName,
        category,
        importable,
      });

      setSheets((prev) => prev.map((s) => (s.sheetName === sheetName ? res.sheet : s)));
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: (err as Error).message,
      });
    }
  };

  const handleSelectHeaderRow = async (sheetName: string, rowIndex: number) => {
    if (!sessionId) return;
    try {
      const res = await updateSheetHeaderMutation.mutateAsync({
        sessionId,
        sheetName,
        headerRowIndex: rowIndex,
      });

      setSheets((prev) => prev.map((s) => (s.sheetName === sheetName ? res.sheet : s)));
      setSheetMappings((prev) => ({
        ...prev,
        [sheetName]: res.sheet.columnMapping || {},
      }));

      setHeaderModalSheet(null);
      toast({
        title: 'Header Row Updated',
        description: `Header row set to Row ${rowIndex} for "${sheetName}". Detected ${res.sheet.detectedHeaders.length} columns.`,
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: (err as Error).message || 'Could not update header row.',
      });
    }
  };

  // =========================================================================
  // Step 3: Column Mapping Handlers
  // =========================================================================

  const handleMappingChange = (sheetName: string, header: string, field: string) => {
    setSheetMappings((prev) => {
      const sheetMap = { ...(prev[sheetName] || {}) };
      if (!field || field === 'none') {
        delete sheetMap[header];
      } else {
        // Prevent duplicate canonical field assignment across different headers within the same sheet
        for (const [k, v] of Object.entries(sheetMap)) {
          if (v === field && k !== header) {
            delete sheetMap[k];
          }
        }
        sheetMap[header] = field;
      }
      return {
        ...prev,
        [sheetName]: sheetMap,
      };
    });
  };

  const handleConfirmMapping = async () => {
    if (!sessionId) return;

    // Validate that at least one importable sheet has employeeCode and hireDate mapped
    let hasAnyCode = false;
    let hasAnyHireDate = false;

    for (const sheet of importableSheets) {
      const mapping = sheetMappings[sheet.sheetName] || {};
      const fields = Object.values(mapping);
      if (fields.includes('employeeCode')) hasAnyCode = true;
      if (fields.includes('hireDate')) hasAnyHireDate = true;
    }

    if (!hasAnyCode) {
      toast({
        variant: 'destructive',
        title: 'Missing Required Mapping',
        description: 'Please map an Excel header to "Employee ID / Code" in at least one employee sheet. People Journey will never auto-generate employee IDs.',
      });
      return;
    }

    if (!hasAnyHireDate) {
      toast({
        variant: 'destructive',
        title: 'Missing Required Mapping',
        description: 'Please map an Excel header to "Date of Joining" in your employee sheets.',
      });
      return;
    }

    try {
      await validateMultiMutation.mutateAsync({
        sessionId,
        sheetMappings,
        saveMappingForWorkspace: saveWorkspaceMapping,
      });

      setCurrentStep('preview');
      setPreviewPage(1);
      refetchPreview();
      toast({
        title: 'Multi-Sheet Reconciliation Complete',
        description: 'Records merged, reconciled, and validated across all active sheets.',
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Validation Failed',
        description: (err as Error).message || 'Failed to validate extracted data.',
      });
    }
  };

  // =========================================================================
  // Step 4: Inline Row Editing Handlers
  // =========================================================================

  const handleOpenRowEdit = (row: ValidatedImportRow) => {
    setEditingRow(row);
    setEditFormData({ ...row.mappedData });
  };

  const handleSaveRowEdit = async () => {
    if (!sessionId || !editingRow) return;

    try {
      await updateRowMutation.mutateAsync({
        sessionId,
        rowIndex: editingRow.rowIndex,
        data: editFormData,
      });

      setEditingRow(null);
      refetchPreview();
      toast({
        title: 'Row Corrected',
        description: `Row ${editingRow.rowIndex} updated and re-validated.`,
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: (err as Error).message || 'Failed to update row.',
      });
    }
  };

  const handleDeleteRow = async (rowIndex: number) => {
    if (!sessionId) return;
    try {
      await deleteRowMutation.mutateAsync({
        sessionId,
        rowIndex,
      });
      refetchPreview();
      toast({
        title: 'Row Removed',
        description: `Row ${rowIndex} was excluded from the import.`,
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Delete Failed',
        description: (err as Error).message || 'Failed to remove row.',
      });
    }
  };

  // =========================================================================
  // Step 5: Final Batch Commit Handler
  // =========================================================================

  const handleCommitImport = async (mode: 'valid_only' | 'all') => {
    if (!sessionId) return;

    try {
      const res = await commitMutation.mutateAsync({
        sessionId,
        mode,
      });

      setCommitResult({
        importedCount: res.result.importedCount,
        skippedCount: res.result.skippedCount,
        errorCount: res.result.errorCount,
        duplicateCount: res.result.duplicateCount,
        statusBreakdown: res.result.statusBreakdown,
      });

      setCurrentStep('complete');
      toast({
        title: 'Import Successful',
        description: `${res.result.importedCount} employees were successfully imported to your workspace.`,
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Import Failed',
        description: (err as Error).message || 'Could not complete batch import.',
      });
    }
  };

  // Summary helper
  const summary: ImportSummary = previewData?.summary || {
    totalRecords: 0,
    validRecords: 0,
    needsAttentionRecords: 0,
    duplicateRecords: 0,
    statusBreakdown: { onboarding: 0, active: 0, offboarding: 0, exited: 0 },
  };

  // Step definition for UI header
  const wizardSteps: { id: WizardStep; label: string }[] = [
    { id: 'upload', label: '1. Upload File' },
    ...(sheets.length > 1 ? [{ id: 'sheets' as WizardStep, label: '2. Sheet Detection' }] : []),
    { id: 'mapping', label: `${sheets.length > 1 ? '3' : '2'}. Column Mapping` },
    { id: 'preview', label: `${sheets.length > 1 ? '4' : '3'}. Preview & Correct` },
    { id: 'commit', label: `${sheets.length > 1 ? '5' : '4'}. Final Commit` },
  ];

  return (
    <div style={{ maxWidth: '1140px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header controls & step indicator */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          padding: '16px 20px',
          background: '#fffdfa',
          border: '1px solid #eee3e2',
          borderRadius: '16px',
        }}
      >
        {/* Step tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {wizardSteps.map((s, idx) => {
            const isActive = currentStep === s.id;
            const stepOrder: WizardStep[] = ['upload', 'sheets', 'mapping', 'preview', 'commit', 'complete'];
            const currentIndex = stepOrder.indexOf(currentStep);
            const stepIndex = stepOrder.indexOf(s.id);
            const isCompleted = currentIndex > stepIndex;

            return (
              <React.Fragment key={s.id}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '13px',
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? '#bd7b92' : isCompleted ? '#3a2d36' : '#a89aa2',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    background: isActive ? '#f4e4ea' : 'transparent',
                  }}
                >
                  {isCompleted ? <Check size={14} style={{ color: '#16a34a' }} /> : null}
                  <span>{s.label}</span>
                </div>
                {idx < wizardSteps.length - 1 && <ChevronRight size={14} style={{ color: '#d3c7ce' }} />}
              </React.Fragment>
            );
          })}
        </div>

        {/* Quick action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            onClick={handleDownloadTemplate}
            disabled={isDownloadingTemplate}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: '8px',
              border: '1px solid #eee3e2',
              background: '#ffffff',
              color: '#58404c',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.15s ease',
            }}
          >
            {isDownloadingTemplate ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            Starter Template (.xlsx)
          </button>

          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: '8px',
              border: '1px solid #eee3e2',
              background: '#ffffff',
              color: '#58404c',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <History size={13} />
            Import History
          </button>
        </div>
      </div>

      {/* =====================================================================
          STEP 1: UPLOAD EXCEL FILE
      ====================================================================== */}
      {currentStep === 'upload' && (
        <div
          style={{
            background: '#fffdfa',
            border: '1px solid #eee3e2',
            borderRadius: '18px',
            padding: '36px',
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#3a2d36' }}>
              Upload Employee Spreadsheet
            </h3>
            <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#887582' }}>
              Upload your employee workbook or HR export. Intelligent header scanning inspects candidate rows to isolate banners, instructions, and multiple worksheets.
            </p>
          </div>

          {/* Drag & drop dropzone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${isDragging ? '#bd7b92' : '#dfc9d0'}`,
              borderRadius: '16px',
              padding: '48px 24px',
              textAlign: 'center',
              background: isDragging ? '#faf0f4' : '#fcf8f8',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
            }}
          >
            <input
              type="file"
              ref={fileInputRef}
              accept=".xlsx,.xls"
              style={{ display: 'none' }}
              onChange={(e) => {
                const files = e.target.files;
                if (files && files.length > 0) {
                  processUploadedFile(files[0]);
                }
              }}
            />

            <span
              style={{
                width: 56,
                height: 56,
                borderRadius: '16px',
                background: '#f4e4ea',
                color: '#bd7b92',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {uploadMutation.isPending ? (
                <Loader2 size={28} className="animate-spin" />
              ) : (
                <UploadCloud size={28} />
              )}
            </span>

            <div>
              <b style={{ fontSize: '15px', color: '#3a2d36', display: 'block' }}>
                {uploadMutation.isPending ? 'Intelligently scanning workbook sheets…' : 'Click to select or drag and drop your Excel file'}
              </b>
              <span style={{ fontSize: '12px', color: '#887582', marginTop: '4px', display: 'block' }}>
                Supports Microsoft Excel (.xlsx, .xls) up to 10MB · Multi-sheet auto-detection enabled
              </span>
            </div>
          </div>

          {/* Instructions card */}
          <div
            style={{
              padding: '18px 20px',
              borderRadius: '14px',
              background: '#f9f6f6',
              border: '1px solid #ebdada',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', gap: '10px' }}>
              <CheckCircle2 size={18} style={{ color: '#16a34a', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <b style={{ fontSize: '13px', color: '#3a2d36' }}>Intelligent Header Scanning</b>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#887582' }}>
                  Titles, banners, and instruction notes on early rows are ignored. The true table header row is automatically isolated.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <Layers size={18} style={{ color: '#bd7b92', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <b style={{ fontSize: '13px', color: '#3a2d36' }}>Multi-Sheet Reconciliation</b>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#887582' }}>
                  Regular employees, contractors, resignations, retention, and transfers across multiple tabs are reconciled into unified profiles.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <AlertCircle size={18} style={{ color: '#ea580c', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <b style={{ fontSize: '13px', color: '#3a2d36' }}>Employee IDs Never Auto-Generated</b>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#887582' }}>
                  To guarantee database audit integrity, People Journey will <b>never fabricate artificial employee codes</b>.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          STEP 2: SHEET DETECTION & CLASSIFICATION SCREEN
      ====================================================================== */}
      {currentStep === 'sheets' && (
        <div
          style={{
            background: '#fffdfa',
            border: '1px solid #eee3e2',
            borderRadius: '18px',
            padding: '28px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#3a2d36' }}>
                Detected Worksheets & Classification
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#887582' }}>
                Found <b>{sheets.length} worksheets</b> in <b>{uploadData?.fileName}</b>. Verify the detected header rows and business classifications before proceeding to column mapping.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: '#887582' }}>
                Active for import: <b>{importableSheets.length} of {sheets.length} sheets</b>
              </span>
            </div>
          </div>

          {/* Sheets List Table */}
          <div style={{ overflowX: 'auto', border: '1px solid #ebdada', borderRadius: '12px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#fbf5f7', borderBottom: '1px solid #ebdada' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: '#3a2d36', width: '22%' }}>Worksheet</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: '#3a2d36', width: '28%' }}>Classification</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: '#3a2d36', width: '18%' }}>Header Row</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: '#3a2d36', width: '16%' }}>Data Rows</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: '#3a2d36', width: '16%', textAlign: 'center' }}>Import</th>
                </tr>
              </thead>
              <tbody>
                {sheets.map((sheet) => {
                  const isIgnored = sheet.category === 'IGNORE' || !sheet.importable;

                  return (
                    <tr
                      key={sheet.sheetName}
                      style={{
                        borderBottom: '1px solid #f2e7e7',
                        background: isIgnored ? '#faf8f8' : '#ffffff',
                        opacity: isIgnored ? 0.75 : 1,
                      }}
                    >
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <FileSpreadsheet
                            size={16}
                            style={{ color: isIgnored ? '#a89aa2' : '#bd7b92', flexShrink: 0 }}
                          />
                          <div>
                            <b style={{ color: isIgnored ? '#887582' : '#3a2d36', fontSize: '13.5px' }}>
                              {sheet.sheetName}
                            </b>
                            <div style={{ fontSize: '11px', color: '#a89aa2', marginTop: '2px' }}>
                              {sheet.columnCount} columns detected
                            </div>
                          </div>
                        </div>
                      </td>

                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ width: '100%', maxWidth: '280px' }}>
                          <AnimatedSelect
                            options={SHEET_CATEGORY_OPTIONS}
                            value={sheet.category}
                            onChange={(val) => handleSheetCategoryChange(sheet.sheetName, val as SheetCategory)}
                            variant="form"
                          />
                        </div>
                      </td>

                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span
                            style={{
                              fontSize: '12px',
                              fontWeight: 600,
                              color: '#3a2d36',
                              background: '#f4e4ea',
                              padding: '3px 8px',
                              borderRadius: '6px',
                            }}
                          >
                            Row {sheet.headerRowIndex}
                          </span>

                          <button
                            type="button"
                            onClick={() => setHeaderModalSheet(sheet)}
                            style={{
                              border: '1px solid #dfc9d0',
                              background: '#ffffff',
                              color: '#58404c',
                              fontSize: '11px',
                              fontWeight: 600,
                              padding: '3px 8px',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <Settings2 size={12} />
                            Change
                          </button>
                        </div>

                        {sheet.isLowConfidence && (
                          <div style={{ fontSize: '10.5px', color: '#b45309', marginTop: '4px' }}>
                            Low confidence — verify header
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '14px 16px', color: '#58404c' }}>
                        <b>{sheet.estimatedDataRows}</b> rows
                        <span style={{ fontSize: '11px', color: '#a89aa2', display: 'block' }}>
                          Confidence: {Math.round(sheet.confidence * 100)}%
                        </span>
                      </td>

                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={sheet.importable && sheet.category !== 'IGNORE'}
                            onChange={(e) => handleToggleSheetImport(sheet.sheetName, e.target.checked)}
                            style={{ width: 17, height: 17, accentColor: '#bd7b92' }}
                          />
                          <span style={{ fontSize: '12px', fontWeight: 600, color: isIgnored ? '#a89aa2' : '#3a2d36' }}>
                            {sheet.importable && sheet.category !== 'IGNORE' ? 'Active' : 'Skip'}
                          </span>
                        </label>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
            <button
              type="button"
              onClick={() => setCurrentStep('upload')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '9px 16px',
                borderRadius: '8px',
                border: '1px solid #eee3e2',
                background: '#fffdfa',
                color: '#58404c',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <ArrowLeft size={14} /> Back to Upload
            </button>

            <button
              type="button"
              disabled={importableSheets.length === 0}
              onClick={() => {
                if (importableSheets.length > 0) {
                  setActiveSheetName(importableSheets[0].sheetName);
                }
                setCurrentStep('mapping');
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 22px',
                borderRadius: '8px',
                border: 'none',
                background: 'linear-gradient(135deg, #bd7b92, #a85c74)',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 600,
                cursor: importableSheets.length === 0 ? 'not-allowed' : 'pointer',
                opacity: importableSheets.length === 0 ? 0.6 : 1,
              }}
            >
              Continue to Column Mapping ({importableSheets.length} Active Sheets) <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          STEP 3: SHEET-SPECIFIC COLUMN MAPPING SCREEN
      ====================================================================== */}
      {currentStep === 'mapping' && activeSheet && (
        <div
          style={{
            background: '#fffdfa',
            border: '1px solid #eee3e2',
            borderRadius: '18px',
            padding: '28px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#3a2d36' }}>
                Verify & Map Columns
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#887582' }}>
                Match sheet columns to People Journey canonical employee fields using the dropdowns below.
              </p>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#58404c' }}>
              <input
                type="checkbox"
                checked={saveWorkspaceMapping}
                onChange={(e) => setSaveWorkspaceMapping(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: '#bd7b92' }}
              />
              <b>Remember this mapping for my workspace</b>
            </label>
          </div>

          {/* Worksheet Tabs for Multi-Sheet Navigation */}
          {importableSheets.length > 1 && (
            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #ebdada', paddingBottom: '8px', overflowX: 'auto' }}>
              {importableSheets.map((s) => {
                const isCurrentTab = s.sheetName === activeSheet.sheetName;
                const mapping = sheetMappings[s.sheetName] || {};
                const mappedCount = Object.keys(mapping).length;
                const totalCols = s.detectedHeaders.length;

                return (
                  <button
                    key={s.sheetName}
                    type="button"
                    onClick={() => setActiveSheetName(s.sheetName)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      border: '1px solid',
                      cursor: 'pointer',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      background: isCurrentTab ? '#f4e4ea' : '#ffffff',
                      borderColor: isCurrentTab ? '#bd7b92' : '#dfc9d0',
                      color: isCurrentTab ? '#bd7b92' : '#58404c',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <FileSpreadsheet size={14} />
                    <span>{s.sheetName}</span>
                    <span
                      style={{
                        fontSize: '11px',
                        padding: '1px 6px',
                        borderRadius: '10px',
                        background: isCurrentTab ? '#bd7b92' : '#f0e6ea',
                        color: isCurrentTab ? '#ffffff' : '#58404c',
                      }}
                    >
                      {mappedCount}/{totalCols}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Active sheet metadata banner */}
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              background: '#f9f5f7',
              border: '1px solid #ebdada',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '12.5px',
              color: '#58404c',
            }}
          >
            <div>
              Active sheet: <b>{activeSheet.sheetName}</b> · Category: <b>{activeSheet.categoryLabel}</b> · Header row: <b>Row {activeSheet.headerRowIndex}</b>
            </div>
            <button
              type="button"
              onClick={() => setHeaderModalSheet(activeSheet)}
              style={{
                border: '1px solid #dfc9d0',
                background: '#fff',
                padding: '3px 8px',
                borderRadius: '6px',
                fontSize: '11px',
                cursor: 'pointer',
                fontWeight: 600,
                color: '#58404c',
              }}
            >
              Change Header Row
            </button>
          </div>

          {/* Mapping Table */}
          <div style={{ overflowX: 'auto', border: '1px solid #ebdada', borderRadius: '12px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#fbf5f7', borderBottom: '1px solid #ebdada' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: '#3a2d36', width: '28%' }}>
                    Excel Column Header
                  </th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: '#3a2d36', width: '32%' }}>
                    Sample Data Preview
                  </th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: '#3a2d36', width: '40%' }}>
                    Maps To Field
                  </th>
                </tr>
              </thead>
              <tbody>
                {activeSheet.detectedHeaders.map((header) => {
                  const currentSheetMapping = sheetMappings[activeSheet.sheetName] || {};
                  const mappedField = currentSheetMapping[header] || '';

                  // Extract real sample values from actual data rows (NOT instructions)
                  const samples = (activeSheet.sampleRows || [])
                    .slice(0, 3)
                    .map((r) => String(r[header] ?? ''))
                    .filter(Boolean)
                    .join(' · ');

                  return (
                    <tr key={header} style={{ borderBottom: '1px solid #f2e7e7' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: '#3a2d36' }}>
                        <span>{header}</span>
                        {mappedField && (
                          <span
                            style={{
                              marginLeft: '8px',
                              fontSize: '10px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: '#ecfdf5',
                              color: '#059669',
                              fontWeight: 600,
                            }}
                          >
                            Auto-matched
                          </span>
                        )}
                      </td>

                      <td style={{ padding: '12px 16px', color: '#887582', fontSize: '12px' }}>
                        {samples || <span style={{ color: '#c7b8c0' }}>—</span>}
                      </td>

                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ width: '100%', maxWidth: '340px' }}>
                          <AnimatedSelect
                            options={columnSelectOptions}
                            value={mappedField}
                            onChange={(val) => handleMappingChange(activeSheet.sheetName, header, val)}
                            placeholder="— Do not import this column —"
                            variant="form"
                            searchable
                            searchPlaceholder="Search fields…"
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
            <button
              type="button"
              onClick={() => setCurrentStep(sheets.length > 1 ? 'sheets' : 'upload')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '9px 16px',
                borderRadius: '8px',
                border: '1px solid #eee3e2',
                background: '#fffdfa',
                color: '#58404c',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <ArrowLeft size={14} /> Back to {sheets.length > 1 ? 'Sheet Detection' : 'Upload'}
            </button>

            <button
              type="button"
              disabled={validateMultiMutation.isPending}
              onClick={handleConfirmMapping}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 22px',
                borderRadius: '8px',
                border: 'none',
                background: 'linear-gradient(135deg, #bd7b92, #a85c74)',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 600,
                cursor: validateMultiMutation.isPending ? 'not-allowed' : 'pointer',
                opacity: validateMultiMutation.isPending ? 0.7 : 1,
              }}
            >
              {validateMultiMutation.isPending ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Reconciling Across Sheets…
                </>
              ) : (
                <>
                  Validate & Preview Reconciled Records <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          STEP 4: UNIFIED RECONCILED PREVIEW & "NEEDS ATTENTION" TABLE
      ====================================================================== */}
      {currentStep === 'preview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Summary Metric Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
            <div
              style={{
                padding: '14px 18px',
                borderRadius: '14px',
                background: '#fffdfa',
                border: '1px solid #eee3e2',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <span style={{ fontSize: '11.5px', color: '#887582', fontWeight: 600, textTransform: 'uppercase' }}>
                Total Reconciled Records
              </span>
              <b style={{ fontSize: '24px', color: '#3a2d36' }}>{summary.totalRecords}</b>
            </div>

            <div
              style={{
                padding: '14px 18px',
                borderRadius: '14px',
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <span style={{ fontSize: '11.5px', color: '#166534', fontWeight: 600, textTransform: 'uppercase' }}>
                Ready to Import
              </span>
              <b style={{ fontSize: '24px', color: '#15803d' }}>{summary.validRecords}</b>
            </div>

            <div
              style={{
                padding: '14px 18px',
                borderRadius: '14px',
                background: summary.needsAttentionRecords > 0 ? '#fffbeb' : '#fffdfa',
                border: summary.needsAttentionRecords > 0 ? '1px solid #fde68a' : '1px solid #eee3e2',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <span style={{ fontSize: '11.5px', color: '#92400e', fontWeight: 600, textTransform: 'uppercase' }}>
                Needs Attention
              </span>
              <b style={{ fontSize: '24px', color: '#b45309' }}>{summary.needsAttentionRecords}</b>
            </div>

            <div
              style={{
                padding: '14px 18px',
                borderRadius: '14px',
                background: summary.duplicateRecords > 0 ? '#fef2f2' : '#fffdfa',
                border: summary.duplicateRecords > 0 ? '1px solid #fecaca' : '1px solid #eee3e2',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <span style={{ fontSize: '11.5px', color: '#991b1b', fontWeight: 600, textTransform: 'uppercase' }}>
                Duplicates Blocked
              </span>
              <b style={{ fontSize: '24px', color: '#dc2626' }}>{summary.duplicateRecords}</b>
            </div>
          </div>

          {/* Filter Bar & Search */}
          <div
            style={{
              background: '#fffdfa',
              border: '1px solid #eee3e2',
              borderRadius: '16px',
              padding: '16px 20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            {/* Filter Tabs */}
            <div style={{ display: 'flex', gap: '6px' }}>
              {[
                { id: 'all', label: `All (${summary.totalRecords})` },
                { id: 'needs_attention', label: `Needs Attention (${summary.needsAttentionRecords})` },
                { id: 'valid', label: `Valid (${summary.validRecords})` },
                { id: 'duplicates', label: `Duplicates (${summary.duplicateRecords})` },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setPreviewFilter(tab.id as typeof previewFilter);
                    setPreviewPage(1);
                  }}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '8px',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    border: '1px solid',
                    cursor: 'pointer',
                    background: previewFilter === tab.id ? '#bd7b92' : '#ffffff',
                    color: previewFilter === tab.id ? '#ffffff' : '#58404c',
                    borderColor: previewFilter === tab.id ? '#bd7b92' : '#dfc9d0',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search and error export */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ position: 'relative', width: '220px' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: '#887582' }} />
                <input
                  type="text"
                  placeholder="Filter preview rows…"
                  value={previewSearch}
                  onChange={(e) => {
                    setPreviewSearch(e.target.value);
                    setPreviewPage(1);
                  }}
                  style={{
                    width: '100%',
                    padding: '7px 12px 7px 30px',
                    borderRadius: '8px',
                    border: '1px solid #eee3e2',
                    fontSize: '12px',
                    outline: 'none',
                    background: '#fffdfa',
                  }}
                />
              </div>

              {summary.needsAttentionRecords > 0 && (
                <button
                  type="button"
                  onClick={handleDownloadErrors}
                  disabled={isDownloadingErrors}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '7px 12px',
                    borderRadius: '8px',
                    border: '1px solid #fed7aa',
                    background: '#fff7ed',
                    color: '#9a3412',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {isDownloadingErrors ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                  Export Issues (.xlsx)
                </button>
              )}
            </div>
          </div>

          {/* Paginated Preview Table */}
          <div
            style={{
              background: '#fffdfa',
              border: '1px solid #eee3e2',
              borderRadius: '16px',
              overflow: 'hidden',
            }}
          >
            {previewLoading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#887582' }}>
                <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px auto', color: '#bd7b92' }} />
                <span>Loading preview records…</span>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#fbf5f7', borderBottom: '1px solid #ebdada' }}>
                      <th style={{ padding: '12px 14px', width: '50px', color: '#3a2d36', fontWeight: 600 }}>Row</th>
                      <th style={{ padding: '12px 14px', width: '110px', color: '#3a2d36', fontWeight: 600 }}>Status</th>
                      <th style={{ padding: '12px 14px', width: '120px', color: '#3a2d36', fontWeight: 600 }}>Employee ID</th>
                      <th style={{ padding: '12px 14px', color: '#3a2d36', fontWeight: 600 }}>Full Name</th>
                      <th style={{ padding: '12px 14px', color: '#3a2d36', fontWeight: 600 }}>Email & Contact</th>
                      <th style={{ padding: '12px 14px', color: '#3a2d36', fontWeight: 600 }}>Dept & Role</th>
                      <th style={{ padding: '12px 14px', color: '#3a2d36', fontWeight: 600 }}>Lifecycle & Dates</th>
                      <th style={{ padding: '12px 14px', color: '#3a2d36', fontWeight: 600 }}>Sources & Details</th>
                      <th style={{ padding: '12px 14px', width: '90px', textAlign: 'center', color: '#3a2d36', fontWeight: 600 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(previewData?.rows || []).map((row) => {
                      const isAttention = row.validationStatus === 'NEEDS_ATTENTION';
                      const isDup = row.validationStatus === 'DUPLICATE';
                      const d = row.mappedData;

                      return (
                        <tr
                          key={row.rowIndex}
                          style={{
                            borderBottom: '1px solid #f3e6e6',
                            background: isAttention ? '#fffdf7' : isDup ? '#fff5f5' : '#ffffff',
                          }}
                        >
                          <td style={{ padding: '10px 14px', color: '#887582', fontWeight: 600 }}>
                            {row.rowIndex}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            {row.validationStatus === 'VALID' && (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  background: '#dcfce7',
                                  color: '#15803d',
                                }}
                              >
                                <Check size={12} /> Valid
                              </span>
                            )}
                            {row.validationStatus === 'NEEDS_ATTENTION' && (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  background: '#fef3c7',
                                  color: '#b45309',
                                }}
                              >
                                <AlertTriangle size={12} /> Attention
                              </span>
                            )}
                            {row.validationStatus === 'DUPLICATE' && (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  background: '#fee2e2',
                                  color: '#b91c1c',
                                }}
                              >
                                <AlertCircle size={12} /> Duplicate
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            {d.employeeCode ? (
                              <b style={{ color: isDup ? '#dc2626' : '#3a2d36' }}>{d.employeeCode}</b>
                            ) : (
                              <span style={{ color: '#dc2626', fontWeight: 700, fontStyle: 'italic', fontSize: '12px' }}>
                                [Missing ID]
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px', fontWeight: 600, color: '#3a2d36' }}>
                            {d.fullName || `${d.firstName} ${d.lastName}`.trim() || <span style={{ color: '#dc2626' }}>[Missing Name]</span>}
                          </td>
                          <td style={{ padding: '10px 14px', color: '#887582', fontSize: '12px' }}>
                            <div>{d.workEmail || '—'}</div>
                            {d.phone && <div style={{ fontSize: '11px', color: '#b5a4ac' }}>{d.phone}</div>}
                          </td>
                          <td style={{ padding: '10px 14px', color: '#58404c', fontSize: '12px' }}>
                            <div>{d.department || 'General'}</div>
                            <div style={{ fontSize: '11px', color: '#887582' }}>{d.designation || 'Team Member'}</div>
                            {d.workLocation && (
                              <div style={{ fontSize: '10.5px', color: '#bd7b92', marginTop: '2px' }}>
                                Site: {d.workLocation}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px', fontSize: '12px' }}>
                            <div style={{ fontWeight: 600, color: '#3a2d36' }}>{d.employmentStatus}</div>
                            <div style={{ fontSize: '11px', color: '#887582' }}>
                              Join: {d.hireDate || <span style={{ color: '#dc2626' }}>Missing</span>}
                            </div>
                            {d.lastWorkingDay && (
                              <div style={{ fontSize: '11px', color: '#dc2626' }}>
                                LWD: {d.lastWorkingDay}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px', fontSize: '11.5px' }}>
                            {/* Source sheets badges */}
                            {row.sourceSheets && row.sourceSheets.length > 0 && (
                              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '6px' }}>
                                {row.sourceSheets.map((src) => (
                                  <span
                                    key={src}
                                    style={{
                                      fontSize: '10px',
                                      padding: '1px 5px',
                                      borderRadius: '4px',
                                      background: '#f4e4ea',
                                      color: '#bd7b92',
                                      fontWeight: 600,
                                    }}
                                  >
                                    {src}
                                  </span>
                                ))}
                                {row.isHistorical && (
                                  <span
                                    style={{
                                      fontSize: '10px',
                                      padding: '1px 5px',
                                      borderRadius: '4px',
                                      background: '#e0e7ff',
                                      color: '#4338ca',
                                      fontWeight: 600,
                                    }}
                                  >
                                    Historical Record
                                  </span>
                                )}
                              </div>
                            )}

                            {row.errors.length > 0 && (
                              <ul style={{ margin: 0, paddingLeft: '14px', color: '#b91c1c' }}>
                                {row.errors.map((err, i) => (
                                  <li key={i}>{err.message}</li>
                                ))}
                              </ul>
                            )}
                            {row.warnings.length > 0 && (
                              <ul style={{ margin: 0, paddingLeft: '14px', color: '#b45309' }}>
                                {row.warnings.map((warn, i) => (
                                  <li key={i}>{warn}</li>
                                ))}
                              </ul>
                            )}
                            {row.errors.length === 0 && row.warnings.length === 0 && (
                              <span style={{ color: '#16a34a' }}>Reconciled & validated</span>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: '6px' }}>
                              <button
                                type="button"
                                title="Edit row"
                                onClick={() => handleOpenRowEdit(row)}
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: '6px',
                                  border: '1px solid #ebdada',
                                  background: '#fffdfa',
                                  color: '#58404c',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                }}
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                type="button"
                                title="Remove row from import"
                                onClick={() => handleDeleteRow(row.rowIndex)}
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: '6px',
                                  border: '1px solid #fecaca',
                                  background: '#fffdfa',
                                  color: '#dc2626',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                }}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {(previewData?.rows || []).length === 0 && (
                      <tr>
                        <td colSpan={9} style={{ padding: '36px', textAlign: 'center', color: '#887582' }}>
                          No records match your filter criteria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            {previewData && previewData.totalPages > 1 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 18px',
                  borderTop: '1px solid #ebdada',
                  fontSize: '12px',
                  color: '#887582',
                }}
              >
                <div>
                  Showing {previewData.rows.length} of {previewData.totalFiltered} filtered records (Page {previewData.page} of {previewData.totalPages})
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    type="button"
                    disabled={previewData.page <= 1}
                    onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '6px',
                      border: '1px solid #dfc9d0',
                      background: '#ffffff',
                      cursor: previewData.page <= 1 ? 'not-allowed' : 'pointer',
                      opacity: previewData.page <= 1 ? 0.5 : 1,
                    }}
                  >
                    <ChevronLeft size={14} />
                  </button>

                  <span>Page {previewData.page}</span>

                  <button
                    type="button"
                    disabled={previewData.page >= previewData.totalPages}
                    onClick={() => setPreviewPage((p) => p + 1)}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '6px',
                      border: '1px solid #dfc9d0',
                      background: '#ffffff',
                      cursor: previewData.page >= previewData.totalPages ? 'not-allowed' : 'pointer',
                      opacity: previewData.page >= previewData.totalPages ? 0.5 : 1,
                    }}
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Bottom navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
            <button
              type="button"
              onClick={() => setCurrentStep('mapping')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '9px 16px',
                borderRadius: '8px',
                border: '1px solid #eee3e2',
                background: '#fffdfa',
                color: '#58404c',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <ArrowLeft size={14} /> Back to Mapping
            </button>

            <button
              type="button"
              disabled={summary.validRecords === 0}
              onClick={() => setCurrentStep('commit')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 22px',
                borderRadius: '8px',
                border: 'none',
                background: 'linear-gradient(135deg, #bd7b92, #a85c74)',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 600,
                cursor: summary.validRecords === 0 ? 'not-allowed' : 'pointer',
                opacity: summary.validRecords === 0 ? 0.6 : 1,
              }}
            >
              Proceed to Final Import ({summary.validRecords} Ready) <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          STEP 5: COMMIT CONFIRMATION & EXECUTION
      ====================================================================== */}
      {currentStep === 'commit' && (
        <div
          style={{
            background: '#fffdfa',
            border: '1px solid #eee3e2',
            borderRadius: '18px',
            padding: '32px',
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#3a2d36' }}>
              Confirm Batch Import
            </h3>
            <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#887582' }}>
              Review the unified employee records that will be committed to your workspace employee database.
            </p>
          </div>

          {/* Breakdown cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div
              style={{
                padding: '20px',
                borderRadius: '14px',
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#166534' }}>
                Records to be Imported
              </span>
              <b style={{ fontSize: '32px', color: '#15803d' }}>{summary.validRecords}</b>
              <span style={{ fontSize: '12px', color: '#15803d' }}>
                These records passed all validation checks and will be committed to PostgreSQL.
              </span>
            </div>

            <div
              style={{
                padding: '20px',
                borderRadius: '14px',
                background: '#fff7ed',
                border: '1px solid #fed7aa',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#9a3412' }}>
                Records to be Skipped
              </span>
              <b style={{ fontSize: '32px', color: '#c2410c' }}>
                {summary.needsAttentionRecords + summary.duplicateRecords}
              </b>
              <span style={{ fontSize: '12px', color: '#9a3412' }}>
                {summary.needsAttentionRecords} requiring attention + {summary.duplicateRecords} duplicates.
              </span>
            </div>
          </div>

          {summary.needsAttentionRecords > 0 && (
            <div
              style={{
                display: 'flex',
                gap: '12px',
                padding: '14px 18px',
                borderRadius: '12px',
                background: '#fffbeb',
                border: '1px solid #fde68a',
                fontSize: '12.5px',
                color: '#92400e',
              }}
            >
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <b>You have unresolved records requiring attention.</b>
                <p style={{ margin: '4px 0 0', color: '#b45309' }}>
                  If you proceed now, only the {summary.validRecords} valid records will be imported. Skipped records will be logged in your workspace import history for audit compliance.
                </p>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
            <button
              type="button"
              onClick={() => setCurrentStep('preview')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '9px 16px',
                borderRadius: '8px',
                border: '1px solid #eee3e2',
                background: '#fffdfa',
                color: '#58404c',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <ArrowLeft size={14} /> Back to Preview
            </button>

            <button
              type="button"
              disabled={commitMutation.isPending || summary.validRecords === 0}
              onClick={() => handleCommitImport('valid_only')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 28px',
                borderRadius: '10px',
                border: 'none',
                background: 'linear-gradient(135deg, #16a34a, #15803d)',
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: 700,
                cursor: commitMutation.isPending ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 14px rgba(22,163,74,0.3)',
              }}
            >
              {commitMutation.isPending ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Importing Employees in Chunks…
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} />
                  Execute Import ({summary.validRecords} Employees)
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          STEP 6: IMPORT COMPLETION SCREEN
      ====================================================================== */}
      {currentStep === 'complete' && commitResult && (
        <div
          style={{
            background: '#fffdfa',
            border: '1px solid #bbf7d0',
            borderRadius: '18px',
            padding: '48px 36px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px',
          }}
        >
          <span
            style={{
              width: 64,
              height: 64,
              borderRadius: '20px',
              background: '#dcfce7',
              color: '#16a34a',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CheckCircle2 size={36} />
          </span>

          <div>
            <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: '#15803d' }}>
              Import Completed Successfully!
            </h3>
            <p style={{ margin: '8px 0 0', fontSize: '14px', color: '#58404c' }}>
              <b>{commitResult.importedCount}</b> employee records were added to your workspace.
            </p>
          </div>

          {/* Breakdown pills */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {Object.entries(commitResult.statusBreakdown || {}).map(([stage, count]) => (
              <span
                key={stage}
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  padding: '6px 14px',
                  borderRadius: '20px',
                  background: '#f4e4ea',
                  color: '#bd7b92',
                }}
              >
                {stage}: {count}
              </span>
            ))}
          </div>

          {/* Navigation shortcuts */}
          <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
            <button
              type="button"
              onClick={() => {
                setCurrentStep('upload');
                setUploadData(null);
                setSheets([]);
                setCommitResult(null);
              }}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                border: '1px solid #eee3e2',
                background: '#ffffff',
                color: '#58404c',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Import Another File
            </button>

            <button
              type="button"
              onClick={() => setLocation('/dashboard/employees')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 24px',
                borderRadius: '8px',
                border: 'none',
                background: 'linear-gradient(135deg, #bd7b92, #a85c74)',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              View in Employee Directory <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          HEADER ROW SELECTOR MODAL (Step 2 Sheet Inspector)
      ====================================================================== */}
      <Dialog open={Boolean(headerModalSheet)} onOpenChange={(o) => { if (!o) setHeaderModalSheet(null); }}>
        <DialogContent
          style={{
            maxWidth: '750px',
            width: '100%',
            background: '#fffdfa',
            border: '1px solid #eee3e2',
            borderRadius: '16px',
            padding: '24px',
          }}
        >
          <DialogHeader>
            <DialogTitle style={{ fontSize: '17px', fontWeight: 700, color: '#3a2d36' }}>
              Select Table Header Row — {headerModalSheet?.sheetName}
            </DialogTitle>
            <DialogDescription style={{ fontSize: '12px', color: '#887582' }}>
              Click on the row containing your column titles (e.g. Employee Code, Name, Email). Rows above will be treated as title banners or instructions.
            </DialogDescription>
          </DialogHeader>

          {headerModalSheet && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '12px' }}>
              <div style={{ maxHeight: '360px', overflowY: 'auto', border: '1px solid #ebdada', borderRadius: '10px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <tbody>
                    {(headerModalSheet.previewGrid || []).map((row) => {
                      const isCurrentHeader = row.rowIndex === headerModalSheet.headerRowIndex;

                      return (
                        <tr
                          key={row.rowIndex}
                          onClick={() => handleSelectHeaderRow(headerModalSheet.sheetName, row.rowIndex)}
                          style={{
                            borderBottom: '1px solid #f2e7e7',
                            background: isCurrentHeader ? '#f4e4ea' : 'transparent',
                            cursor: 'pointer',
                            transition: 'background 0.15s ease',
                          }}
                        >
                          <td
                            style={{
                              padding: '8px 12px',
                              width: '80px',
                              fontWeight: 700,
                              color: isCurrentHeader ? '#bd7b92' : '#887582',
                              background: isCurrentHeader ? '#eedae2' : '#faf5f7',
                              borderRight: '1px solid #ebdada',
                              textAlign: 'center',
                            }}
                          >
                            Row {row.rowIndex}
                            {isCurrentHeader && <div style={{ fontSize: '9.5px', color: '#bd7b92' }}>(Current)</div>}
                          </td>
                          <td style={{ padding: '8px 12px', color: '#3a2d36' }}>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                              {row.cells.map((cell, idx) => (
                                <span
                                  key={idx}
                                  style={{
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    background: isCurrentHeader ? '#ffffff' : '#f5f0f2',
                                    border: '1px solid #e8dfe3',
                                    fontSize: '11.5px',
                                  }}
                                >
                                  {cell || <span style={{ color: '#c7b8c0' }}>—</span>}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setHeaderModalSheet(null)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: '1px solid #eee3e2',
                    background: '#ffffff',
                    color: '#58404c',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* =====================================================================
          ROW EDIT MODAL (with AnimatedSelect for Lifecycle Status)
      ====================================================================== */}
      <Dialog open={Boolean(editingRow)} onOpenChange={(o) => { if (!o) setEditingRow(null); }}>
        <DialogContent
          style={{
            maxWidth: '560px',
            width: '100%',
            background: '#fffdfa',
            border: '1px solid #eee3e2',
            borderRadius: '16px',
            padding: '24px',
          }}
        >
          <DialogHeader>
            <DialogTitle style={{ fontSize: '17px', fontWeight: 700, color: '#3a2d36' }}>
              Edit Row {editingRow?.rowIndex} in Preview
            </DialogTitle>
            <DialogDescription style={{ fontSize: '12px', color: '#887582' }}>
              Correct fields requiring attention without modifying your original spreadsheet.
            </DialogDescription>
          </DialogHeader>

          {editingRow && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#3a2d36', marginBottom: '4px' }}>
                  Employee ID / Code *
                </label>
                <input
                  type="text"
                  value={editFormData.employeeCode || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, employeeCode: e.target.value })}
                  placeholder="e.g. EMP-1042"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #ebdada',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#3a2d36', marginBottom: '4px' }}>
                    First Name *
                  </label>
                  <input
                    type="text"
                    value={editFormData.firstName || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, firstName: e.target.value })}
                    placeholder="First name"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #ebdada',
                      fontSize: '13px',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#3a2d36', marginBottom: '4px' }}>
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={editFormData.lastName || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, lastName: e.target.value })}
                    placeholder="Last name"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #ebdada',
                      fontSize: '13px',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#3a2d36', marginBottom: '4px' }}>
                    Work Email
                  </label>
                  <input
                    type="email"
                    value={editFormData.workEmail || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, workEmail: e.target.value })}
                    placeholder="employee@company.com"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #ebdada',
                      fontSize: '13px',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#3a2d36', marginBottom: '4px' }}>
                    Phone Number
                  </label>
                  <input
                    type="text"
                    value={editFormData.phone || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                    placeholder="+1-555-0100"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #ebdada',
                      fontSize: '13px',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#3a2d36', marginBottom: '4px' }}>
                    Department
                  </label>
                  <input
                    type="text"
                    value={editFormData.department || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, department: e.target.value })}
                    placeholder="e.g. Engineering"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #ebdada',
                      fontSize: '13px',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#3a2d36', marginBottom: '4px' }}>
                    Designation / Role
                  </label>
                  <input
                    type="text"
                    value={editFormData.designation || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, designation: e.target.value })}
                    placeholder="e.g. Senior Analyst"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #ebdada',
                      fontSize: '13px',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#3a2d36', marginBottom: '4px' }}>
                    Date of Joining (YYYY-MM-DD) *
                  </label>
                  <input
                    type="text"
                    value={editFormData.hireDate || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, hireDate: e.target.value })}
                    placeholder="YYYY-MM-DD"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #ebdada',
                      fontSize: '13px',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#3a2d36', marginBottom: '4px' }}>
                    Lifecycle Status
                  </label>
                  <AnimatedSelect
                    options={[
                      { value: 'ACTIVE', label: 'Active', badge: 'Employed' },
                      { value: 'ONBOARDING', label: 'Onboarding', badge: 'Pre-hire' },
                      { value: 'OFFBOARDING', label: 'Offboarding', badge: 'Notice' },
                      { value: 'EXITED', label: 'Exited', badge: 'Departed' },
                    ]}
                    value={editFormData.employmentStatus || 'ACTIVE'}
                    onChange={(val) => setEditFormData({ ...editFormData, employmentStatus: val as any })}
                    variant="form"
                  />
                </div>
              </div>

              {(editFormData.employmentStatus === 'OFFBOARDING' || editFormData.employmentStatus === 'EXITED') && (
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#3a2d36', marginBottom: '4px' }}>
                    Last Working Day (YYYY-MM-DD) *
                  </label>
                  <input
                    type="text"
                    value={editFormData.lastWorkingDay || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, lastWorkingDay: e.target.value })}
                    placeholder="YYYY-MM-DD"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #ebdada',
                      fontSize: '13px',
                    }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setEditingRow(null)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: '1px solid #eee3e2',
                    background: '#ffffff',
                    color: '#58404c',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={updateRowMutation.isPending}
                  onClick={handleSaveRowEdit}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #bd7b92, #a85c74)',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: updateRowMutation.isPending ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  {updateRowMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  Save & Re-validate
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* =====================================================================
          IMPORT HISTORY DIALOG
      ====================================================================== */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent
          style={{
            maxWidth: '680px',
            width: '100%',
            background: '#fffdfa',
            border: '1px solid #eee3e2',
            borderRadius: '16px',
            padding: '24px',
          }}
        >
          <DialogHeader>
            <DialogTitle style={{ fontSize: '17px', fontWeight: 700, color: '#3a2d36' }}>
              Import History
            </DialogTitle>
            <DialogDescription style={{ fontSize: '12px', color: '#887582' }}>
              Past employee batch import operations in your workspace.
            </DialogDescription>
          </DialogHeader>

          <div style={{ marginTop: '16px', maxHeight: '400px', overflowY: 'auto' }}>
            {historyLoading ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#887582' }}>
                <Loader2 size={20} className="animate-spin" style={{ margin: '0 auto 6px auto', color: '#bd7b92' }} />
                <span>Loading history…</span>
              </div>
            ) : importHistory.length === 0 ? (
              <div style={{ padding: '36px', textAlign: 'center', color: '#887582', fontSize: '13px' }}>
                No past imports found in this workspace.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {importHistory.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      padding: '12px 16px',
                      borderRadius: '10px',
                      background: '#ffffff',
                      border: '1px solid #ebdada',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <b style={{ fontSize: '13px', color: '#3a2d36' }}>{item.filename}</b>
                      <div style={{ fontSize: '11px', color: '#887582', marginTop: '2px' }}>
                        {new Date(item.uploadedAt).toLocaleString()} · {item.totalRecords} total records
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: item.status === 'COMPLETED' ? '#dcfce7' : item.status === 'PARTIAL' ? '#fef3c7' : '#fee2e2',
                          color: item.status === 'COMPLETED' ? '#15803d' : item.status === 'PARTIAL' ? '#b45309' : '#b91c1c',
                        }}
                      >
                        {item.importedRecords} imported
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
