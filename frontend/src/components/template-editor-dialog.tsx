import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AnimatedSelect } from '@/components/ui/animated-select';
import {
  useCompanyExitTemplate,
  useUpdateTemplateDraft,
  usePublishTemplate,
  useResetTemplateToDefault,
} from '@/api/queries';
import { useToast } from '@/hooks/use-toast';
import type { ExitQuestionnaireSchema, QuestionnaireQuestion, QuestionnaireSection } from '@/types/api';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  History,
  Layers,
  ListPlus,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';

interface TemplateEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: 'editor' | 'preview';
}

export function TemplateEditorDialog({
  open,
  onOpenChange,
  initialMode = 'editor',
}: TemplateEditorDialogProps) {
  const { toast } = useToast();
  const { data: template, isLoading, refetch } = useCompanyExitTemplate();
  const updateDraft = useUpdateTemplateDraft();
  const publishTemplate = usePublishTemplate();
  const resetToDefault = useResetTemplateToDefault();

  const [activeMode, setActiveMode] = useState<'editor' | 'preview'>(initialMode);
  const [selectedSectionIndex, setSelectedSectionIndex] = useState(0);
  const [draftSchema, setDraftSchema] = useState<ExitQuestionnaireSchema | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [changeSummary, setChangeSummary] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);

  // Sync loaded template schema to local editable draft state
  useEffect(() => {
    if (template?.schema) {
      setDraftSchema(JSON.parse(JSON.stringify(template.schema)));
      setIsDirty(false);
    }
  }, [template]);

  useEffect(() => {
    if (open) {
      setActiveMode(initialMode);
    }
  }, [open, initialMode]);

  if (!open) return null;

  const currentSection: QuestionnaireSection | undefined =
    draftSchema?.sections?.[selectedSectionIndex];

  // Helper updates
  const updateCurrentSection = (fields: Partial<QuestionnaireSection>) => {
    if (!draftSchema || !currentSection) return;
    const updated = { ...draftSchema };
    updated.sections[selectedSectionIndex] = {
      ...currentSection,
      ...fields,
    };
    setDraftSchema(updated);
    setIsDirty(true);
  };

  const updateQuestion = (qIndex: number, fields: Partial<QuestionnaireQuestion>) => {
    if (!draftSchema || !currentSection) return;
    const updated = { ...draftSchema };
    const questions = [...currentSection.questions];
    questions[qIndex] = {
      ...questions[qIndex],
      ...fields,
    };
    updated.sections[selectedSectionIndex] = {
      ...currentSection,
      questions,
    };
    setDraftSchema(updated);
    setIsDirty(true);
  };

  const addQuestion = () => {
    if (!draftSchema || !currentSection) return;
    const newId = `q_${Date.now()}`;
    const newQuestion: QuestionnaireQuestion = {
      id: newId,
      label: 'New Question',
      type: 'text',
      required: false,
      placeholder: 'Enter response...',
    };
    const updated = { ...draftSchema };
    updated.sections[selectedSectionIndex] = {
      ...currentSection,
      questions: [...currentSection.questions, newQuestion],
    };
    setDraftSchema(updated);
    setIsDirty(true);
  };

  const deleteQuestion = (qIndex: number) => {
    if (!draftSchema || !currentSection) return;
    if (!window.confirm('Delete this question from the section?')) return;
    const updated = { ...draftSchema };
    const questions = currentSection.questions.filter((_, idx) => idx !== qIndex);
    updated.sections[selectedSectionIndex] = {
      ...currentSection,
      questions,
    };
    setDraftSchema(updated);
    setIsDirty(true);
  };

  const moveQuestion = (qIndex: number, direction: 'up' | 'down') => {
    if (!draftSchema || !currentSection) return;
    const questions = [...currentSection.questions];
    const targetIdx = direction === 'up' ? qIndex - 1 : qIndex + 1;
    if (targetIdx < 0 || targetIdx >= questions.length) return;
    const temp = questions[qIndex];
    questions[qIndex] = questions[targetIdx];
    questions[targetIdx] = temp;

    const updated = { ...draftSchema };
    updated.sections[selectedSectionIndex] = {
      ...currentSection,
      questions,
    };
    setDraftSchema(updated);
    setIsDirty(true);
  };

  const handleSaveDraft = async () => {
    if (!draftSchema) return;
    try {
      await updateDraft.mutateAsync({
        schema: draftSchema,
        name: template?.name,
        description: template?.description,
      });
      setIsDirty(false);
      toast({
        title: 'Draft saved',
        description: 'Questionnaire updates saved to draft. You can publish whenever ready.',
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Could not save draft.',
      });
    }
  };

  const handlePublish = async () => {
    if (!draftSchema) return;
    try {
      // First ensure draft is up to date
      if (isDirty) {
        await updateDraft.mutateAsync({
          schema: draftSchema,
          name: template?.name,
          description: template?.description,
        });
      }
      await publishTemplate.mutateAsync({
        changeSummary: changeSummary.trim() || 'Updated exit questionnaire template',
      });
      setPublishModalOpen(false);
      setChangeSummary('');
      setIsDirty(false);
      toast({
        title: 'Version published successfully!',
        description: 'All newly issued exit interviews will now use this published version.',
      });
      refetch();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Publish failed',
        description: err instanceof Error ? err.message : 'Could not publish template.',
      });
    }
  };

  const handleResetToDefault = async () => {
    if (
      !window.confirm(
        'Reset this company template to the master default 9-section Infravision questionnaire? Any uncommitted draft changes will be replaced.'
      )
    ) {
      return;
    }
    try {
      await resetToDefault.mutateAsync();
      toast({
        title: 'Template reset to master default',
        description: 'The canonical 9-section questionnaire has been restored.',
      });
      refetch();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Reset failed',
        description: err instanceof Error ? err.message : 'Could not reset template.',
      });
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
        <DialogContent
          hideCloseButton={true}
          className="max-w-6xl w-[95vw] h-[90vh] p-0 flex flex-col bg-[#fffdfb] overflow-hidden border border-[#ebdada]"
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
        >
          {/* Top Bar Header */}
          <div className="px-6 py-4 border-b border-[#f0e4e6] flex flex-wrap items-center justify-between gap-3 bg-white">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#59424f] text-white flex items-center justify-center font-bold">
                <FileText size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-stone-800">Exit Feedback Questionnaire</h2>
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-[#ebdada] text-[#59424f]">
                    v{template?.version || 1}
                  </span>
                  {isDirty && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                      Unsaved Draft Changes
                    </span>
                  )}
                </div>
                <p className="text-xs text-stone-500">
                  Manage company-specific exit interview questions across all 9 standardized sections.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Mode switch */}
              <div className="flex items-center rounded-lg border border-stone-200 bg-stone-100 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setActiveMode('editor')}
                  className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                    activeMode === 'editor'
                      ? 'bg-white text-stone-800 shadow-sm font-semibold'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <Layers size={13} className="inline mr-1.5" /> Visual Editor
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMode('preview')}
                  className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                    activeMode === 'preview'
                      ? 'bg-white text-stone-800 shadow-sm font-semibold'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <Eye size={13} className="inline mr-1.5" /> Employee Preview
                </button>
              </div>

              {/* Version History Button */}
              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                className="secondary-action text-xs px-2.5 py-1.5"
                title="View version history"
              >
                <History size={14} className="mr-1" /> History
              </button>

              {/* Reset to Default */}
              <button
                type="button"
                onClick={handleResetToDefault}
                disabled={resetToDefault.isPending}
                className="secondary-action text-xs px-2.5 py-1.5 text-stone-600 hover:text-stone-900"
                title="Reset to canonical master template"
              >
                <RotateCcw size={14} className="mr-1" /> Reset Default
              </button>

              {/* Save Draft */}
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={updateDraft.isPending || !isDirty}
                className="secondary-action text-xs px-3 py-1.5"
              >
                {updateDraft.isPending ? (
                  <Loader2 size={14} className="animate-spin mr-1" />
                ) : (
                  <Save size={14} className="mr-1" />
                )}
                Save Draft
              </button>

              {/* Publish Version */}
              <button
                type="button"
                onClick={() => setPublishModalOpen(true)}
                disabled={publishTemplate.isPending}
                className="primary-action text-xs px-3.5 py-1.5 bg-[#59424f] text-white hover:bg-[#483540]"
              >
                <UploadCloud size={14} className="mr-1" /> Publish New Version
              </button>

              <div className="w-[1px] h-5 bg-stone-200 mx-0.5" />

              {/* Single Accessible Close Button */}
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[#bd7b92]"
                aria-label="Close template editor"
                title="Close template editor"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Loading or Content */}
          {isLoading || !draftSchema ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="animate-spin text-stone-400" size={32} />
            </div>
          ) : activeMode === 'preview' ? (
            /* PREVIEW MODE */
            <div className="flex-1 overflow-y-auto p-6 bg-stone-50">
              <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-stone-200 p-8 space-y-6">
                <div className="border-b border-stone-100 pb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wider text-[#b67c90] font-bold">
                      Employee Questionnaire Preview
                    </span>
                    <span className="text-xs text-stone-400">Total Sections: {draftSchema.sections.length}</span>
                  </div>
                  <h1 className="text-2xl font-bold text-stone-800 mt-1">{template?.name || 'Exit Feedback Questionnaire'}</h1>
                  <p className="text-sm text-stone-500 mt-1">{draftSchema.introduction || template?.description || 'Your feedback helps us continuously improve our company culture and workplace.'}</p>
                </div>

                <div className="space-y-8">
                  {draftSchema.sections.map((sec, secIdx) => (
                    <div key={sec.id} className="border border-stone-100 rounded-xl p-5 bg-[#fffdfb]">
                      <div className="mb-4">
                        <span className="text-xs font-bold text-[#59424f] uppercase tracking-wide">
                          Section {secIdx + 1}
                        </span>
                        <h3 className="text-base font-bold text-stone-800">{sec.title}</h3>
                        {sec.description && (
                          <p className="text-xs text-stone-500 mt-0.5">{sec.description}</p>
                        )}
                      </div>

                      <div className="space-y-4">
                        {sec.questions.map((q, qIdx) => (
                          <div key={q.id} className="bg-white p-4 rounded-lg border border-stone-100 shadow-2xs">
                            <label className="block text-xs font-semibold text-stone-800 mb-1">
                              {qIdx + 1}. {q.label}
                              {q.required && <span className="text-rose-500 ml-1">*</span>}
                            </label>
                            {q.placeholder && (
                              <p className="text-[11px] text-stone-400 mb-2">{q.placeholder}</p>
                            )}

                            {/* Question render preview */}
                            {q.type === 'textarea' ? (
                              <textarea
                                disabled
                                placeholder={q.placeholder || 'Type response here...'}
                                className="w-full text-xs p-2.5 rounded border border-stone-200 bg-stone-50 h-16 resize-none"
                              />
                            ) : q.type === 'radio' && q.options ? (
                              <div className="space-y-1.5 pt-1">
                                {q.options.map(opt => (
                                  <label key={opt} className="flex items-center gap-2 text-xs text-stone-600">
                                    <input type="radio" disabled name={q.id} />
                                    <span>{opt}</span>
                                  </label>
                                ))}
                              </div>
                            ) : q.type === 'checkbox' && q.options ? (
                              <div className="space-y-1.5 pt-1">
                                {q.options.map(opt => (
                                  <label key={opt} className="flex items-center gap-2 text-xs text-stone-600">
                                    <input type="checkbox" disabled />
                                    <span>{opt}</span>
                                  </label>
                                ))}
                              </div>
                            ) : q.type === 'rating_matrix' && q.matrixRows ? (
                              <div className="overflow-x-auto mt-2">
                                <table className="w-full text-xs border border-stone-200 rounded">
                                  <thead className="bg-stone-50 border-b border-stone-200">
                                    <tr>
                                      <th className="p-2 text-left text-stone-600 font-semibold">Aspect</th>
                                      {[1, 2, 3, 4, 5].map(n => (
                                        <th key={n} className="p-2 text-center text-stone-500 w-12 font-medium">
                                          {n}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {q.matrixRows.map(row => (
                                      <tr key={row.id} className="border-t border-stone-100 hover:bg-stone-50/50">
                                        <td className="p-2 text-stone-700">{row.label}</td>
                                        {[1, 2, 3, 4, 5].map(n => (
                                          <td key={n} className="p-2 text-center">
                                            <input type="radio" disabled name={`${q.id}_${row.id}`} />
                                          </td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <input
                                type={q.type === 'date' ? 'date' : 'text'}
                                disabled
                                placeholder={q.placeholder || 'Your response...'}
                                className="w-full text-xs p-2 rounded border border-stone-200 bg-stone-50"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* VISUAL EDITOR MODE */
            <div className="flex-1 flex overflow-hidden">
              {/* Left Sidebar: Sections List */}
              <div className="w-72 border-r border-[#f0e4e6] bg-[#fcf9f9] flex flex-col overflow-y-auto">
                <div className="p-3 border-b border-[#f0e4e6] flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-600 uppercase tracking-wider">
                    Sections ({draftSchema.sections.length})
                  </span>
                </div>

                <div className="p-2 space-y-1">
                  {draftSchema.sections.map((section, idx) => {
                    const isSelected = idx === selectedSectionIndex;
                    return (
                      <button
                        key={section.id}
                        type="button"
                        onClick={() => setSelectedSectionIndex(idx)}
                        className={`w-full text-left p-2.5 rounded-lg text-xs transition-all flex items-start gap-2.5 ${
                          isSelected
                            ? 'bg-[#59424f] text-white font-semibold shadow-xs'
                            : 'text-stone-700 hover:bg-white hover:shadow-2xs'
                        }`}
                      >
                        <span
                          className={`w-5 h-5 rounded flex items-center justify-center text-[10px] shrink-0 font-bold ${
                            isSelected ? 'bg-white/20 text-white' : 'bg-stone-200 text-stone-600'
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{section.title}</p>
                          <span
                            className={`text-[11px] block ${
                              isSelected ? 'text-white/80' : 'text-stone-400'
                            }`}
                          >
                            {section.questions.length} questions
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right Panel: Active Section Questions Editor */}
              <div className="flex-1 flex flex-col overflow-y-auto p-6 bg-[#fffdfb]">
                {currentSection && (
                  <div className="max-w-4xl w-full mx-auto space-y-6">
                    {/* Section Metadata Card */}
                    <div className="p-5 rounded-xl border border-[#ebdada] bg-white shadow-2xs space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-[#b67c90]">
                          Section {selectedSectionIndex + 1} Settings
                        </span>
                        <span className="text-xs text-stone-400 font-mono">ID: {currentSection.id}</span>
                      </div>

                      <div className="grid grid-cols-1 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-stone-600 mb-1">
                            Section Title
                          </label>
                          <input
                            type="text"
                            value={currentSection.title}
                            onChange={e => updateCurrentSection({ title: e.target.value })}
                            className="w-full text-xs font-semibold p-2.5 rounded-lg border border-stone-200 outline-none focus:border-[#59424f]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-stone-600 mb-1">
                            Section Guidance / Instructions (Optional)
                          </label>
                          <textarea
                            value={currentSection.description || ''}
                            onChange={e => updateCurrentSection({ description: e.target.value })}
                            rows={2}
                            className="w-full text-xs p-2.5 rounded-lg border border-stone-200 outline-none focus:border-[#59424f] resize-none"
                            placeholder="Helpful context or privacy notice for employee..."
                          />
                        </div>
                      </div>
                    </div>

                    {/* Section Questions */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-stone-800 flex items-center gap-2">
                          <span>Questions</span>
                          <span className="text-xs font-normal text-stone-500">
                            ({currentSection.questions.length})
                          </span>
                        </h3>

                        <button
                          type="button"
                          onClick={addQuestion}
                          className="secondary-action text-xs px-3 py-1.5 text-[#59424f] font-semibold"
                        >
                          <Plus size={14} className="mr-1" /> Add Question
                        </button>
                      </div>

                      {currentSection.questions.map((q, qIdx) => (
                        <div
                          key={q.id}
                          className="p-4 rounded-xl border border-[#ebdada] bg-white shadow-2xs space-y-3 transition-all hover:border-[#cfb6bc]"
                        >
                          <div className="flex items-center justify-between gap-3 border-b border-stone-100 pb-2">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-stone-100 text-stone-600 flex items-center justify-center text-[10px] font-bold">
                                {qIdx + 1}
                              </span>
                              <span className="text-xs font-mono text-stone-400">{q.id}</span>
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                disabled={qIdx === 0}
                                onClick={() => moveQuestion(qIdx, 'up')}
                                className="p-1 text-stone-400 hover:text-stone-700 disabled:opacity-30"
                                title="Move question up"
                              >
                                <ArrowUp size={14} />
                              </button>
                              <button
                                type="button"
                                disabled={qIdx === currentSection.questions.length - 1}
                                onClick={() => moveQuestion(qIdx, 'down')}
                                className="p-1 text-stone-400 hover:text-stone-700 disabled:opacity-30"
                                title="Move question down"
                              >
                                <ArrowDown size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteQuestion(qIdx)}
                                className="p-1 text-stone-400 hover:text-rose-600 ml-2"
                                title="Delete question"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="md:col-span-2">
                              <label className="block text-xs font-medium text-stone-600 mb-1">
                                Question Label
                              </label>
                              <input
                                type="text"
                                value={q.label}
                                onChange={e => updateQuestion(qIdx, { label: e.target.value })}
                                className="w-full text-xs font-medium p-2 rounded-lg border border-stone-200 outline-none focus:border-[#59424f]"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-stone-600 mb-1">
                                Question Type
                              </label>
                              <AnimatedSelect
                                id={`question-type-${q.id}`}
                                variant="form"
                                value={q.type}
                                onChange={val =>
                                  updateQuestion(qIdx, {
                                    type: val as any,
                                  })
                                }
                                options={[
                                  { value: 'text', label: 'Single Line Text' },
                                  { value: 'textarea', label: 'Paragraph Text' },
                                  { value: 'radio', label: 'Single Choice (Radio)' },
                                  { value: 'checkbox', label: 'Multiple Choice (Checkboxes)' },
                                  { value: 'rating', label: 'Rating Scale (1-5)' },
                                  { value: 'rating_matrix', label: 'Matrix Table (1-5)' },
                                  { value: 'date', label: 'Date Picker' },
                                  { value: 'email', label: 'Email' },
                                  { value: 'declaration', label: 'Declaration & Signature' },
                                ]}
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-stone-500 mb-1">
                                Placeholder / Hint
                              </label>
                              <input
                                type="text"
                                value={q.placeholder || ''}
                                onChange={e => updateQuestion(qIdx, { placeholder: e.target.value })}
                                className="w-full text-xs p-2 rounded-lg border border-stone-200 outline-none focus:border-[#59424f]"
                                placeholder="Optional hint text..."
                              />
                            </div>

                            <div className="flex items-center gap-4 pt-4">
                              <label className="flex items-center gap-2 cursor-pointer text-xs text-stone-700">
                                <input
                                  type="checkbox"
                                  checked={!!q.required}
                                  onChange={e => updateQuestion(qIdx, { required: e.target.checked })}
                                  className="rounded text-[#59424f]"
                                />
                                <span className="font-medium">Mandatory Question</span>
                              </label>
                            </div>
                          </div>

                          {/* Options editor for radio/checkbox */}
                          {(q.type === 'radio' || q.type === 'checkbox') && (
                            <div className="p-3 bg-stone-50 rounded-lg border border-stone-200 space-y-2">
                              <span className="text-xs font-semibold text-stone-700 block">
                                Multiple Choice Options
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {(q.options || []).map((opt, optIdx) => (
                                  <span
                                    key={optIdx}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-stone-200 rounded text-xs text-stone-800"
                                  >
                                    <span>{opt}</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newOpts = (q.options || []).filter((_, i) => i !== optIdx);
                                        updateQuestion(qIdx, { options: newOpts });
                                      }}
                                      className="text-stone-400 hover:text-rose-600"
                                    >
                                      <X size={12} />
                                    </button>
                                  </span>
                                ))}
                              </div>
                              <div className="flex items-center gap-2 pt-1">
                                <input
                                  type="text"
                                  id={`new_opt_${q.id}`}
                                  placeholder="Type option and click Add..."
                                  className="text-xs p-1.5 rounded border border-stone-200 bg-white flex-1"
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      const input = e.currentTarget;
                                      if (input.value.trim()) {
                                        const current = q.options || [];
                                        updateQuestion(qIdx, {
                                          options: [...current, input.value.trim()],
                                        });
                                        input.value = '';
                                      }
                                    }
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const input = document.getElementById(
                                      `new_opt_${q.id}`
                                    ) as HTMLInputElement | null;
                                    if (input && input.value.trim()) {
                                      const current = q.options || [];
                                      updateQuestion(qIdx, {
                                        options: [...current, input.value.trim()],
                                      });
                                      input.value = '';
                                    }
                                  }}
                                  className="secondary-action text-xs px-2.5 py-1.5"
                                >
                                  Add Option
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Matrix rows editor */}
                          {q.type === 'rating_matrix' && (
                            <div className="p-3 bg-stone-50 rounded-lg border border-stone-200 space-y-2">
                              <span className="text-xs font-semibold text-stone-700 block">
                                Matrix Rows (Statements to Rate 1 to 5)
                              </span>
                              <div className="space-y-1.5">
                                {(q.matrixRows || []).map((row, rIdx) => (
                                  <div key={row.id} className="flex items-center gap-2">
                                    <input
                                      type="text"
                                      value={row.label}
                                      onChange={e => {
                                        const newRows = [...(q.matrixRows || [])];
                                        newRows[rIdx] = { ...row, label: e.target.value };
                                        updateQuestion(qIdx, { matrixRows: newRows });
                                      }}
                                      className="text-xs p-1.5 rounded border border-stone-200 bg-white flex-1"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newRows = (q.matrixRows || []).filter(
                                          (_, i) => i !== rIdx
                                        );
                                        updateQuestion(qIdx, { matrixRows: newRows });
                                      }}
                                      className="text-stone-400 hover:text-rose-600 p-1"
                                      title="Remove row"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  const current = q.matrixRows || [];
                                  const newRow = {
                                    id: `r_${Date.now()}`,
                                    label: 'New evaluation statement',
                                  };
                                  updateQuestion(qIdx, { matrixRows: [...current, newRow] });
                                }}
                                className="secondary-action text-xs px-2.5 py-1"
                              >
                                <Plus size={12} className="mr-1" /> Add Matrix Statement
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Publish Confirmation Modal */}
      <Dialog open={publishModalOpen} onOpenChange={setPublishModalOpen}>
        <DialogContent className="max-w-md bg-white border border-[#ebdada]">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-stone-800">
              Publish New Template Version
            </DialogTitle>
            <DialogDescription className="text-xs text-stone-500">
              Publishing will create <b>v{(template?.version || 1) + 1}</b>. All future exit interviews will use this version. Existing active and completed interviews will preserve their previous snapshot version.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-2">
            <label className="block text-xs font-semibold text-stone-700">
              Change Summary / Version Notes
            </label>
            <textarea
              value={changeSummary}
              onChange={e => setChangeSummary(e.target.value)}
              placeholder="e.g. Added career growth questions to Section E..."
              className="w-full text-xs p-2.5 rounded-lg border border-stone-200 outline-none focus:border-[#59424f] h-20 resize-none"
            />
          </div>

          <DialogFooter className="gap-2">
            <button
              type="button"
              className="secondary-action text-xs"
              onClick={() => setPublishModalOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={publishTemplate.isPending}
              onClick={handlePublish}
              className="primary-action text-xs bg-[#59424f] text-white hover:bg-[#483540]"
            >
              {publishTemplate.isPending ? (
                <Loader2 size={14} className="animate-spin mr-1" />
              ) : (
                <UploadCloud size={14} className="mr-1" />
              )}
              Publish v{(template?.version || 1) + 1}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Version History Drawer / Modal */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-lg bg-white border border-[#ebdada]">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-stone-800 flex items-center gap-2">
              <History size={18} /> Template Version History
            </DialogTitle>
            <DialogDescription className="text-xs text-stone-500">
              Audit record of all published versions of this company questionnaire.
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 max-h-96 overflow-y-auto space-y-3">
            {template?.versions && template.versions.length > 0 ? (
              template.versions.map(v => (
                <div
                  key={v.id}
                  className="p-3 rounded-lg border border-stone-200 bg-stone-50 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-stone-800">Version {v.versionNumber}</span>
                    <span className="text-[11px] text-stone-400">
                      {new Intl.DateTimeFormat(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(new Date(v.publishedAt))}
                    </span>
                  </div>
                  <p className="text-stone-600 italic">
                    "{v.changeSummary || 'No change summary recorded'}"
                  </p>
                </div>
              ))
            ) : (
              <p className="text-xs text-stone-400 py-4 text-center">
                Currently running on initial Version {template?.version || 1}.
              </p>
            )}
          </div>

          <DialogFooter>
            <button
              type="button"
              className="secondary-action text-xs"
              onClick={() => setHistoryOpen(false)}
            >
              Close
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
