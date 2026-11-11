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
} from 'lucide-react';
import {
  useUploadImportFile,
  useValidateImportMapping,
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
import type {
  UploadExcelResponse,
  ColumnDetectionResult,
  CanonicalFieldDefinition,
  ValidatedImportRow,
  ImportSummary,
} from '@/types/api';

type WizardStep = 'upload' | 'mapping' | 'preview' | 'commit' | 'complete';

export function SmartEmployeeImportWizard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Wizard Navigation
  const [currentStep, setCurrentStep] = useState<WizardStep>('upload');
  const [historyOpen, setHistoryOpen] = useState(false);

  // Session State
  const [uploadData, setUploadData] = useState<UploadExcelResponse | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [saveWorkspaceMapping, setSaveWorkspaceMapping] = useState(true);

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
  const validateMutation = useValidateImportMapping();
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

  // Extract canonical field definitions
  const canonicalFields = uploadData?.canonicalFields || [];

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
        setColumnMapping(res.detection.suggestedMapping || {});
        setCurrentStep('mapping');
        toast({
          title: 'Excel File Parsed',
          description: `Detected ${res.detection.detectedHeaders.length} columns and ${res.totalRows} data rows.`,
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
    } catch (err) {
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
    } catch (err) {
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
  // Step 2: Mapping Handlers
  // =========================================================================

  const handleMappingChange = (header: string, field: string) => {
    setColumnMapping((prev) => {
      const next = { ...prev };
      if (!field || field === 'none') {
        delete next[header];
      } else {
        // Prevent duplicate canonical field assignment across different headers
        for (const [k, v] of Object.entries(next)) {
          if (v === field && k !== header) {
            delete next[k];
          }
        }
        next[header] = field;
      }
      return next;
    });
  };

  const handleConfirmMapping = async () => {
    if (!sessionId) return;

    // Check required fields: employeeCode and hireDate
    const mappedFields = Object.values(columnMapping);
    const hasCode = mappedFields.includes('employeeCode');
    const hasName = mappedFields.includes('fullName') || mappedFields.includes('firstName');
    const hasHireDate = mappedFields.includes('hireDate');

    if (!hasCode) {
      toast({
        variant: 'destructive',
        title: 'Missing Required Mapping',
        description: 'Please map an Excel header to "Employee ID / Code". People Journey will never auto-generate employee IDs.',
      });
      return;
    }

    if (!hasName) {
      toast({
        variant: 'destructive',
        title: 'Missing Required Mapping',
        description: 'Please map an Excel header to "Full Name" or "First Name".',
      });
      return;
    }

    if (!hasHireDate) {
      toast({
        variant: 'destructive',
        title: 'Missing Required Mapping',
        description: 'Please map an Excel header to "Date of Joining".',
      });
      return;
    }

    try {
      await validateMutation.mutateAsync({
        sessionId,
        columnMapping,
        saveMappingForWorkspace: saveWorkspaceMapping,
      });

      setCurrentStep('preview');
      setPreviewPage(1);
      refetchPreview();
      toast({
        title: 'Mapping Confirmed',
        description: 'Records extracted and validated against workspace rules.',
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
  // Step 3: Inline Row Editing Handlers
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
  // Step 4: Final Batch Commit Handler
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

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {[
            { id: 'upload', label: '1. Upload File' },
            { id: 'mapping', label: '2. Column Mapping' },
            { id: 'preview', label: '3. Preview & Correct' },
            { id: 'commit', label: '4. Final Commit' },
          ].map((s, idx) => {
            const isActive = currentStep === s.id;
            const isCompleted =
              (s.id === 'upload' && currentStep !== 'upload') ||
              (s.id === 'mapping' && (currentStep === 'preview' || currentStep === 'commit' || currentStep === 'complete')) ||
              (s.id === 'preview' && (currentStep === 'commit' || currentStep === 'complete')) ||
              (s.id === 'commit' && currentStep === 'complete');

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
                {idx < 3 && <ChevronRight size={14} style={{ color: '#d3c7ce' }} />}
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
              Upload your employee list from Excel or HR export. Intelligent column detection will automatically match your headers.
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
                {uploadMutation.isPending ? 'Analyzing spreadsheet…' : 'Click to select or drag and drop your Excel file'}
              </b>
              <span style={{ fontSize: '12px', color: '#887582', marginTop: '4px', display: 'block' }}>
                Supports Microsoft Excel files (.xlsx, .xls) up to 10MB (max 2,500 rows per batch)
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
                <b style={{ fontSize: '13px', color: '#3a2d36' }}>Header row in Row 1</b>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#887582' }}>
                  Column titles should be on the first row of your sheet (e.g. Employee ID, Full Name, Email, Department).
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <AlertCircle size={18} style={{ color: '#ea580c', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <b style={{ fontSize: '13px', color: '#3a2d36' }}>Employee IDs are required</b>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#887582' }}>
                  To protect your organization’s ID integrity, People Journey will <b>never auto-generate employee IDs</b>.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <Calendar size={18} style={{ color: '#bd7b92', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <b style={{ fontSize: '13px', color: '#3a2d36' }}>Flexible date parsing</b>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#887582' }}>
                  Dates formatted as YYYY-MM-DD, DD/MM/YYYY, or native Excel date formats are automatically recognized.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          STEP 2: COLUMN MAPPING
      ====================================================================== */}
      {currentStep === 'mapping' && uploadData && (
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
                We matched {Object.keys(columnMapping).length} of {uploadData.detection.detectedHeaders.length} columns from{' '}
                <b>{uploadData.fileName}</b>. Match any unmapped columns below.
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
                {uploadData.detection.detectedHeaders.map((header) => {
                  const mappedField = columnMapping[header] || '';
                  const conf = uploadData.detection.confidence[header] || 0;
                  const samples = (uploadData.detection.previewSampleRows || [])
                    .slice(0, 3)
                    .map((r) => String(r[header] ?? ''))
                    .filter(Boolean)
                    .join(' · ');

                  return (
                    <tr key={header} style={{ borderBottom: '1px solid #f2e7e7' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: '#3a2d36' }}>
                        <span>{header}</span>
                        {conf >= 0.9 && (
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
                        <select
                          value={mappedField}
                          onChange={(e) => handleMappingChange(header, e.target.value)}
                          style={{
                            width: '100%',
                            maxWidth: '320px',
                            padding: '8px 12px',
                            borderRadius: '8px',
                            border: mappedField ? '1px solid #dfc9d0' : '1px solid #ebdada',
                            background: mappedField ? '#ffffff' : '#fafafa',
                            color: '#3a2d36',
                            fontSize: '13px',
                            cursor: 'pointer',
                            outline: 'none',
                          }}
                        >
                          <option value="">— Do not import this column —</option>
                          {canonicalFields.map((f) => (
                            <option key={f.field} value={f.field}>
                              {f.label} {f.required ? '(Required)' : ''}
                            </option>
                          ))}
                        </select>
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
              disabled={validateMutation.isPending}
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
                cursor: validateMutation.isPending ? 'not-allowed' : 'pointer',
                opacity: validateMutation.isPending ? 0.7 : 1,
              }}
            >
              {validateMutation.isPending ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Validating Records…
                </>
              ) : (
                <>
                  Validate & Preview Rows <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          STEP 3: PREVIEW & "NEEDS ATTENTION" TABLE
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
                Total Records
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
                Duplicate Codes
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
                      <th style={{ padding: '12px 14px', color: '#3a2d36', fontWeight: 600 }}>Validation Details</th>
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
                              <span style={{ color: '#16a34a' }}>All checks passed</span>
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
          STEP 4: COMMIT CONFIRMATION & EXECUTION
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
              Review the records that will be committed to your workspace employee database.
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
          STEP 5: IMPORT COMPLETION SCREEN
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
          ROW EDIT MODAL
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

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#3a2d36', marginBottom: '4px' }}>
                  Work Email
                </label>
                <input
                  type="email"
                  value={editFormData.workEmail || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, workEmail: e.target.value })}
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
                  <select
                    value={editFormData.employmentStatus || 'ACTIVE'}
                    onChange={(e) => setEditFormData({ ...editFormData, employmentStatus: e.target.value as any })}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #ebdada',
                      fontSize: '13px',
                      background: '#fff',
                    }}
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="ONBOARDING">Onboarding</option>
                    <option value="OFFBOARDING">Offboarding</option>
                    <option value="EXITED">Exited</option>
                  </select>
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

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                <button
                  type="button"
                  onClick={() => setEditingRow(null)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: '1px solid #eee3e2',
                    background: '#fff',
                    fontSize: '13px',
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
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 18px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#bd7b92',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {updateRowMutation.isPending && <Loader2 size={13} className="animate-spin" />}
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
              Workspace Import History
            </DialogTitle>
            <DialogDescription style={{ fontSize: '12px', color: '#887582' }}>
              Past employee batches imported into your workspace.
            </DialogDescription>
          </DialogHeader>

          {historyLoading ? (
            <div style={{ padding: '36px', textAlign: 'center', color: '#887582' }}>
              <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px auto', color: '#bd7b92' }} />
              <span>Loading import logs…</span>
            </div>
          ) : (
            <div style={{ overflowX: 'auto', marginTop: '12px', maxHeight: '400px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ background: '#fbf5f7', borderBottom: '1px solid #ebdada' }}>
                    <th style={{ padding: '10px 12px', color: '#3a2d36', fontWeight: 600 }}>Date</th>
                    <th style={{ padding: '10px 12px', color: '#3a2d36', fontWeight: 600 }}>Filename</th>
                    <th style={{ padding: '10px 12px', color: '#3a2d36', fontWeight: 600 }}>Total</th>
                    <th style={{ padding: '10px 12px', color: '#3a2d36', fontWeight: 600 }}>Imported</th>
                    <th style={{ padding: '10px 12px', color: '#3a2d36', fontWeight: 600 }}>Skipped</th>
                    <th style={{ padding: '10px 12px', color: '#3a2d36', fontWeight: 600 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {importHistory.map((h) => (
                    <tr key={h.id} style={{ borderBottom: '1px solid #f3e6e6' }}>
                      <td style={{ padding: '10px 12px', color: '#887582' }}>
                        {new Date(h.uploadedAt).toLocaleDateString()} {new Date(h.uploadedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: '#3a2d36' }}>
                        {h.filename}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#3a2d36' }}>{h.totalRecords}</td>
                      <td style={{ padding: '10px 12px', color: '#16a34a', fontWeight: 600 }}>{h.importedRecords}</td>
                      <td style={{ padding: '10px 12px', color: '#ea580c' }}>{h.skippedRecords}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: '4px',
                            background: h.status === 'COMPLETED' ? '#dcfce7' : h.status === 'PARTIAL' ? '#fef3c7' : '#fee2e2',
                            color: h.status === 'COMPLETED' ? '#15803d' : h.status === 'PARTIAL' ? '#b45309' : '#b91c1c',
                          }}
                        >
                          {h.status}
                        </span>
                      </td>
                    </tr>
                  ))}

                  {importHistory.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#887582' }}>
                        No past import records found for this workspace.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
