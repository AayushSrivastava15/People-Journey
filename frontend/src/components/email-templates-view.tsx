import { useState, useMemo } from 'react';
import {
  FileText, Search, Plus, Copy, Edit2, Trash2, Check,
  Sparkles, ExternalLink, ShieldCheck, UserCheck, X, Loader2
} from 'lucide-react';
import {
  useEmailTemplates,
  useCreateEmailTemplate,
  useUpdateEmailTemplate,
  useDuplicateEmailTemplate,
  useDeleteEmailTemplate,
} from '@/api/queries';
import type { EmailTemplate, EmailTemplateCategory } from '@/types/api';
import { useToast } from '@/hooks/use-toast';
import { AnimatedSelect } from '@/components/ui/animated-select';
import {
  EMAIL_TEMPLATE_CATEGORIES,
  normalizeCategory,
  getCategoryLabel,
  getCategoryShortLabel,
} from '@/utils/email-categories';
import { EmailPreparationDialog } from './email-preparation-dialog';

export function EmailTemplatesView() {
  const { toast } = useToast();
  const { data: templates = [], isLoading } = useEmailTemplates();
  const createMutation = useCreateEmailTemplate();
  const updateMutation = useUpdateEmailTemplate();
  const duplicateMutation = useDuplicateEmailTemplate();
  const deleteMutation = useDeleteEmailTemplate();

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null);

  // Preparation modal state
  const [activeTemplateForEmail, setActiveTemplateForEmail] = useState<EmailTemplate | null>(null);

  // Editor Modal state
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [modalForm, setModalForm] = useState({
    name: '',
    category: 'preboarding',
    description: '',
    subjectTemplate: '',
    bodyTemplate: '',
  });

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: templates.length,
    };
    EMAIL_TEMPLATE_CATEGORIES.forEach(cat => {
      counts[cat.key] = templates.filter(t => normalizeCategory(t.category) === cat.key).length;
    });
    return counts;
  }, [templates]);

  const categoryOptions = useMemo(() => {
    return [
      {
        value: 'all',
        label: 'All Categories',
        badge: String(categoryCounts.all || 0),
      },
      ...EMAIL_TEMPLATE_CATEGORIES.map(cat => ({
        value: cat.key,
        label: cat.label,
        badge: String(categoryCounts[cat.key] || 0),
      })),
    ];
  }, [categoryCounts]);

  const filteredTemplates = useMemo(() => {
    return templates.filter(t => {
      const matchesCategory =
        selectedCategory === 'all' ||
        selectedCategory === 'All' ||
        normalizeCategory(t.category) === normalizeCategory(selectedCategory);
      const matchesSearch =
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        (t.description || '').toLowerCase().includes(search.toLowerCase()) ||
        t.subjectTemplate.toLowerCase().includes(search.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [templates, selectedCategory, search]);

  const handleDuplicate = async (template: EmailTemplate) => {
    try {
      await duplicateMutation.mutateAsync(template.id);
      toast({
        title: 'Template Duplicated',
        description: `Created a customizable copy "${template.name} (Custom)" in your workspace.`,
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Duplicate Failed',
        description: (err as Error).message || 'Failed to duplicate template.',
      });
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete your custom template "${name}"?`)) return;
    try {
      await deleteMutation.mutateAsync(id);
      toast({
        title: 'Template Deleted',
        description: `Custom template "${name}" was removed.`,
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Delete Failed',
        description: (err as Error).message || 'Failed to delete template.',
      });
    }
  };

  const openCreateModal = () => {
    setModalForm({
      name: '',
      category: 'preboarding',
      description: '',
      subjectTemplate: 'Welcome to {{company_name}}, {{employee_first_name}}!',
      bodyTemplate: 'Dear {{employee_first_name}},\n\nWelcome to {{company_name}}!\n\nBest regards,\n{{sender_name}}',
    });
    setEditingTemplate(null);
    setIsCreating(true);
  };

  const openEditModal = (template: EmailTemplate) => {
    setModalForm({
      name: template.name,
      category: normalizeCategory(template.category),
      description: template.description || '',
      subjectTemplate: template.subjectTemplate,
      bodyTemplate: template.bodyTemplate,
    });
    setEditingTemplate(template);
    setIsCreating(true);
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalForm.name.trim() || !modalForm.subjectTemplate.trim() || !modalForm.bodyTemplate.trim()) {
      toast({
        variant: 'destructive',
        title: 'Missing Fields',
        description: 'Template name, subject, and body are required.',
      });
      return;
    }

    try {
      if (editingTemplate) {
        await updateMutation.mutateAsync({
          id: editingTemplate.id,
          payload: {
            name: modalForm.name.trim(),
            category: modalForm.category,
            description: modalForm.description.trim() || undefined,
            subjectTemplate: modalForm.subjectTemplate.trim(),
            bodyTemplate: modalForm.bodyTemplate,
          },
        });
        toast({
          title: 'Template Updated',
          description: `Saved changes to "${modalForm.name}".`,
        });
      } else {
        await createMutation.mutateAsync({
          name: modalForm.name.trim(),
          category: modalForm.category,
          description: modalForm.description.trim() || undefined,
          subjectTemplate: modalForm.subjectTemplate.trim(),
          bodyTemplate: modalForm.bodyTemplate,
        });
        toast({
          title: 'Custom Template Created',
          description: `Created template "${modalForm.name}" in your workspace.`,
        });
      }
      setIsCreating(false);
      setEditingTemplate(null);
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Save Failed',
        description: (err as Error).message || 'Failed to save template.',
      });
    }
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="page-eyebrow">Communication Library</span>
          <h1>Email Templates</h1>
          <p>
            Standardized, editable lifecycle templates for recruitment, preboarding, first-day, and exit milestones.
          </p>
        </div>
        <button
          type="button"
          className="primary-action"
          onClick={openCreateModal}
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Plus size={16} /> Create Template
        </button>
      </div>

      {/* Filter and Search Controls */}
      <section className="panel" style={{ padding: '16px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '260px', flex: 1 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 12px',
                borderRadius: '8px',
                background: '#ffffff',
                border: '1px solid #e5dada',
                width: '100%',
              }}
            >
              <Search size={15} style={{ color: '#88747f' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search templates by name, keyword, subject…"
                style={{
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  width: '100%',
                  fontSize: '12px',
                }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#88747f' }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: '#7a6673', fontWeight: 600, whiteSpace: 'nowrap' }}>Category:</span>
            <AnimatedSelect
              variant="filter"
              value={selectedCategory}
              onChange={val => setSelectedCategory(val)}
              options={categoryOptions}
              style={{ minWidth: '340px' }}
            />
          </div>
        </div>
      </section>

      {/* Templates Grid */}
      {isLoading ? (
        <section className="panel" style={{ padding: '40px', textAlign: 'center', color: '#887582' }}>
          <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px auto', color: '#bd7b92' }} />
          <span>Loading email templates…</span>
        </section>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '16px',
          }}
        >
          {filteredTemplates.map(template => {
            const isCustom = !template.isSystemTemplate;
            return (
              <article
                key={template.id}
                className="panel"
                style={{
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  borderRadius: '14px',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '6px',
                        background: '#fbebf1',
                        color: '#9e3258',
                        textTransform: 'uppercase',
                        letterSpacing: '.04em',
                      }}
                    >
                      {getCategoryShortLabel(template.category)}
                    </span>
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: isCustom ? '#ecfdf5' : '#f1f5f9',
                        color: isCustom ? '#047857' : '#475569',
                      }}
                    >
                      {isCustom ? 'Custom Template' : 'Starter Standard'}
                    </span>
                  </div>

                  <h3 style={{ margin: '0 0 6px 0', fontSize: '15px', fontWeight: 700, color: '#3b2b35' }}>
                    {template.name}
                  </h3>

                  <p style={{ margin: '0 0 12px 0', fontSize: '11px', color: '#7a6873', lineHeight: 1.5 }}>
                    {template.description || 'Lifecycle touchpoint email template.'}
                  </p>

                  <div
                    style={{
                      padding: '8px 10px',
                      borderRadius: '8px',
                      background: '#faf6f8',
                      border: '1px solid #f2e7eb',
                      marginBottom: '14px',
                      fontSize: '11px',
                    }}
                  >
                    <span style={{ color: '#8d7885', fontSize: '10px', display: 'block', fontWeight: 600 }}>Subject:</span>
                    <code style={{ color: '#382b33', fontSize: '11px', wordBreak: 'break-word' }}>
                      {template.subjectTemplate}
                    </code>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: '12px',
                    borderTop: '1px solid #f2e7eb',
                    gap: '6px',
                  }}
                >
                  <button
                    type="button"
                    className="primary-action"
                    onClick={() => setActiveTemplateForEmail(template)}
                    style={{ fontSize: '11px', padding: '6px 12px' }}
                  >
                    <ExternalLink size={13} /> Use Template
                  </button>

                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      type="button"
                      className="secondary-action"
                      onClick={() => setPreviewTemplate(template)}
                      title="Preview Template Content"
                      style={{ padding: '6px 10px', fontSize: '11px' }}
                    >
                      Preview
                    </button>

                    {isCustom ? (
                      <>
                        <button
                          type="button"
                          className="secondary-action"
                          onClick={() => openEditModal(template)}
                          title="Edit Custom Template"
                          style={{ padding: '6px 8px' }}
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          type="button"
                          className="secondary-action"
                          onClick={() => handleDelete(template.id, template.name)}
                          title="Delete Custom Template"
                          style={{ padding: '6px 8px', color: '#be123c' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="secondary-action"
                        onClick={() => handleDuplicate(template)}
                        title="Duplicate into Workspace to Customize"
                        style={{ padding: '6px 8px' }}
                      >
                        <Copy size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Preview Modal */}
      {previewTemplate && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            background: 'rgba(29, 21, 26, 0.6)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '680px',
              backgroundColor: '#fffcfc',
              borderRadius: '14px',
              boxShadow: '0 18px 40px rgba(0,0,0,0.2)',
              border: '1px solid #f0e2e2',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '85vh',
            }}
          >
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #f2e4e4',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <span style={{ fontSize: '10px', color: '#9e3258', fontWeight: 700, textTransform: 'uppercase' }}>
                  {previewTemplate.category}
                </span>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#33242e' }}>
                  {previewTemplate.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewTemplate(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#88747f' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
              <div style={{ marginBottom: '12px' }}>
                <b style={{ display: 'block', fontSize: '11px', color: '#6e5c67', marginBottom: '4px' }}>
                  Subject Template:
                </b>
                <div style={{ padding: '8px 12px', background: '#f8f4f6', borderRadius: '6px', fontSize: '12px' }}>
                  {previewTemplate.subjectTemplate}
                </div>
              </div>

              <div>
                <b style={{ display: 'block', fontSize: '11px', color: '#6e5c67', marginBottom: '4px' }}>
                  Body Template:
                </b>
                <pre
                  style={{
                    margin: 0,
                    padding: '12px',
                    background: '#f8f4f6',
                    borderRadius: '8px',
                    fontSize: '12px',
                    lineHeight: 1.6,
                    fontFamily: 'inherit',
                    whiteSpace: 'pre-wrap',
                    color: '#2d1e28',
                  }}
                >
                  {previewTemplate.bodyTemplate}
                </pre>
              </div>
            </div>

            <div
              style={{
                padding: '12px 20px',
                borderTop: '1px solid #f2e4e4',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '8px',
              }}
            >
              <button
                type="button"
                className="secondary-action"
                onClick={() => setPreviewTemplate(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="primary-action"
                onClick={() => {
                  const t = previewTemplate;
                  setPreviewTemplate(null);
                  setActiveTemplateForEmail(t);
                }}
              >
                <ExternalLink size={14} /> Use in Email
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Custom Template Modal */}
      {isCreating && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            background: 'rgba(29, 21, 26, 0.65)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '720px',
              backgroundColor: '#fffcfc',
              borderRadius: '16px',
              boxShadow: '0 20px 45px rgba(0,0,0,0.25)',
              border: '1px solid #f0e2e2',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '90vh',
            }}
          >
            <form onSubmit={handleSaveModal} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div
                style={{
                  padding: '16px 22px',
                  borderBottom: '1px solid #f2e4e4',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#33242e' }}>
                  {editingTemplate ? 'Edit Custom Template' : 'Create Custom Template'}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#88747f' }}
                >
                  <X size={18} />
                </button>
              </div>

              <div style={{ padding: '20px 22px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#4d3945', marginBottom: '4px' }}>
                      Template Name <span style={{ color: '#e11d48' }}>*</span>
                    </label>
                    <input
                      value={modalForm.name}
                      onChange={e => setModalForm({ ...modalForm, name: e.target.value })}
                      placeholder="e.g. 60-Day Check-in Meeting"
                      style={{ width: '100%', fontSize: '12px', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2d2d2' }}
                      required
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#4d3945', marginBottom: '4px' }}>
                      Lifecycle Category <span style={{ color: '#e11d48' }}>*</span>
                    </label>
                    <AnimatedSelect
                      variant="form"
                      value={modalForm.category}
                      onChange={val => setModalForm(prev => ({ ...prev, category: normalizeCategory(val) }))}
                      options={EMAIL_TEMPLATE_CATEGORIES.map(c => ({
                        value: c.key,
                        label: c.label,
                      }))}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#4d3945', marginBottom: '4px' }}>
                    Description
                  </label>
                  <input
                    value={modalForm.description}
                    onChange={e => setModalForm({ ...modalForm, description: e.target.value })}
                    placeholder="Brief description of when this email is sent"
                    style={{ width: '100%', fontSize: '12px', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2d2d2' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#4d3945', marginBottom: '4px' }}>
                    Subject Line Template <span style={{ color: '#e11d48' }}>*</span>
                  </label>
                  <input
                    value={modalForm.subjectTemplate}
                    onChange={e => setModalForm({ ...modalForm, subjectTemplate: e.target.value })}
                    placeholder="e.g. Milestone review for {{employee_first_name}} at {{company_name}}"
                    style={{ width: '100%', fontSize: '12px', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2d2d2', fontWeight: 600 }}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#4d3945', marginBottom: '4px' }}>
                    Body Template <span style={{ color: '#e11d48' }}>*</span>
                  </label>
                  <textarea
                    rows={8}
                    value={modalForm.bodyTemplate}
                    onChange={e => setModalForm({ ...modalForm, bodyTemplate: e.target.value })}
                    style={{
                      width: '100%',
                      fontSize: '12px',
                      padding: '10px',
                      borderRadius: '8px',
                      border: '1px solid #e2d2d2',
                      fontFamily: 'inherit',
                      lineHeight: 1.5,
                      whiteSpace: 'pre-wrap',
                    }}
                    required
                  />
                  <small style={{ color: '#88747f', fontSize: '10px', marginTop: '4px', display: 'block' }}>
                    Supported placeholders: <code>{'{{company_name}}'}</code>, <code>{'{{employee_first_name}}'}</code>, <code>{'{{job_title}}'}</code>, <code>{'{{joining_date}}'}</code>, <code>{'{{hr_contact_name}}'}</code>, <code>{'{{hr_contact_email}}'}</code>, <code>{'{{sender_name}}'}</code>.
                  </small>
                </div>
              </div>

              <div
                style={{
                  padding: '14px 22px',
                  borderTop: '1px solid #f2e4e4',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '8px',
                  background: '#fffdfd',
                }}
              >
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => setIsCreating(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-action"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {createMutation.isPending || updateMutation.isPending ? 'Saving…' : 'Save Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Email Preparation Dialog */}
      {activeTemplateForEmail && (
        <EmailPreparationDialog
          isOpen={true}
          onClose={() => setActiveTemplateForEmail(null)}
          initialTemplateId={activeTemplateForEmail.id}
          initialCategory={activeTemplateForEmail.category}
        />
      )}
    </>
  );
}
