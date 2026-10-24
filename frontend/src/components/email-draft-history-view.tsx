import { useState } from 'react';
import {
  Activity, Mail, Search, Clock, ExternalLink, CheckCircle2,
  AlertCircle, ChevronLeft, ChevronRight, Loader2, Info, Eye, X, Copy, Check
} from 'lucide-react';
import { useEmailDrafts, useUpdateDraftStatus } from '@/api/queries';
import type { EmailDraft, EmailDraftStatus } from '@/types/api';
import { useToast } from '@/hooks/use-toast';
import { AnimatedSelect } from '@/components/ui/animated-select';

const fmt = (date: string | null | undefined) => {
  if (!date) return '—';
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return date;
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(d);
  } catch {
    return date;
  }
};

const STATUS_LABELS: Record<EmailDraftStatus, { label: string; bg: string; color: string; border: string }> = {
  prepared: { label: 'Prepared', bg: '#fef3c7', color: '#92400e', border: '#fde68a' },
  gmail_opened: { label: 'Gmail Opened', bg: '#dbeafe', color: '#1e40af', border: '#bfdbfe' },
  sent_unconfirmed: { label: 'Sent (Unconfirmed)', bg: '#dcfce7', color: '#166534', border: '#bbf7d0' },
  cancelled: { label: 'Cancelled', bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' },
};

export function EmailDraftHistoryView() {
  const { toast } = useToast();
  const [page, setPage] = useState(0);
  const [pageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  const [viewingDraft, setViewingDraft] = useState<EmailDraft | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: draftData, isLoading } = useEmailDrafts({
    page: page + 1,
    limit: pageSize,
    search: search || undefined,
    status: statusFilter !== 'All' ? statusFilter : undefined,
  });

  const updateStatusMutation = useUpdateDraftStatus();

  const drafts = draftData?.data || [];
  const total = draftData?.total || 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const handleUpdateStatus = async (id: string, status: EmailDraftStatus) => {
    try {
      await updateStatusMutation.mutateAsync({ id, status });
      toast({
        title: 'Status Updated',
        description: `Draft status updated to ${STATUS_LABELS[status].label}.`,
      });
      if (viewingDraft && viewingDraft.id === id) {
        setViewingDraft({ ...viewingDraft, status });
      }
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: (err as Error).message || 'Failed to update draft status.',
      });
    }
  };

  const handleReopenInGmail = async (draft: EmailDraft) => {
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
      draft.recipientEmail
    )}&su=${encodeURIComponent(draft.subjectSnapshot)}&body=${encodeURIComponent(draft.bodySnapshot)}`;

    const win = window.open('about:blank', '_blank');

    try {
      await updateStatusMutation.mutateAsync({
        id: draft.id,
        status: 'gmail_opened',
        recordGmailOpen: true,
      });
      if (win && !win.closed) {
        win.location.href = gmailUrl;
      } else {
        window.open(gmailUrl, '_blank', 'noopener,noreferrer');
      }
    } catch {
      if (win && !win.closed) {
        win.location.href = gmailUrl;
      } else {
        window.open(gmailUrl, '_blank', 'noopener,noreferrer');
      }
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: 'Copied to Clipboard' });
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="page-eyebrow">Audit Trail & Record</span>
          <h1>Notification History</h1>
          <p>
            Saved draft snapshots, Gmail dispatch records, and employee lifecycle communication history.
          </p>
        </div>
      </div>

      {/* Honest Status Disclaimer */}
      <div
        style={{
          padding: '12px 16px',
          borderRadius: '12px',
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '12px',
          color: '#475569',
        }}
      >
        <Info size={18} style={{ color: '#2563eb', flexShrink: 0 }} />
        <span>
          <b>Delivery Notice:</b> Prepared in People Journey. Email sending and delivery cannot be verified because Gmail is opened separately. You review and send emails directly inside Gmail.
        </span>
      </div>

      <section className="panel listing-panel">
        <div className="list-controls">
          <label className="list-search">
            <Search size={16} />
            <span className="sr-only">Search drafts</span>
            <input
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="Search by recipient, subject, employee…"
            />
          </label>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: '#7a6673', fontWeight: 600, whiteSpace: 'nowrap' }}>Status:</span>
            <AnimatedSelect
              variant="filter"
              value={statusFilter}
              onChange={val => {
                setStatusFilter(val);
                setPage(0);
              }}
              options={[
                { value: 'All', label: 'All Drafts' },
                { value: 'prepared', label: 'Prepared' },
                { value: 'gmail_opened', label: 'Gmail Opened' },
                { value: 'sent_unconfirmed', label: 'Sent (Unconfirmed)' },
                { value: 'cancelled', label: 'Cancelled' },
              ]}
              style={{ minWidth: '170px' }}
            />
          </div>
        </div>

        {isLoading ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#887582' }}>
            <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px auto', color: '#bd7b92' }} />
            <span>Loading draft history…</span>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <colgroup>
                <col style={{ width: '22%' }} />
                <col style={{ width: '26%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '16%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Recipient / Employee</th>
                  <th>Subject Snapshot</th>
                  <th>Lifecycle Event</th>
                  <th>Status & Timestamp</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {drafts.map(draft => {
                  const statusConfig = STATUS_LABELS[draft.status] || STATUS_LABELS.prepared;
                  return (
                    <tr key={draft.id}>
                      <td>
                        <span className="person-cell">
                          <span className="person-avatar">
                            {(draft.recipientName || draft.employeeName || 'EM')
                              .split(' ')
                              .map(p => p[0])
                              .join('')
                              .slice(0, 2)}
                          </span>
                          <span>
                            <b>{draft.recipientName || draft.employeeName || 'Recipient'}</b>
                            <small>{draft.recipientEmail}</small>
                          </span>
                        </span>
                      </td>

                      <td>
                        <b style={{ display: 'block', fontSize: '12px', color: '#2d1e28' }}>
                          {draft.subjectSnapshot}
                        </b>
                        <small style={{ color: '#88747f' }}>
                          {draft.templateName || 'Custom Template'}
                        </small>
                      </td>

                      <td>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#4b3844' }}>
                          {draft.lifecycleEvent}
                        </span>
                      </td>

                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: 700,
                              background: statusConfig.bg,
                              color: statusConfig.color,
                              border: `1px solid ${statusConfig.border}`,
                              width: 'fit-content',
                            }}
                          >
                            {statusConfig.label}
                          </span>
                          <small style={{ color: '#88747f', fontSize: '10px' }}>
                            Prepared: {fmt(draft.preparedAt)}
                          </small>
                          {draft.gmailOpenedAt && (
                            <small style={{ color: '#2563eb', fontSize: '10px' }}>
                              Gmail opened: {fmt(draft.gmailOpenedAt)}
                            </small>
                          )}
                        </div>
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button
                            type="button"
                            className="secondary-action"
                            onClick={() => setViewingDraft(draft)}
                            style={{ fontSize: '11px', padding: '5px 10px' }}
                            title="View Full Snapshot"
                          >
                            <Eye size={13} /> View
                          </button>
                          <button
                            type="button"
                            className="primary-action"
                            onClick={() => handleReopenInGmail(draft)}
                            style={{ fontSize: '11px', padding: '5px 10px' }}
                            title="Reopen Compose in Gmail"
                          >
                            <ExternalLink size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {drafts.length === 0 && (
              <div className="table-empty">
                <Activity size={24} style={{ color: '#b5798e' }} />
                <b>No saved email drafts</b>
                <span>
                  Prepared email drafts and Gmail compose actions will appear in this history log.
                </span>
              </div>
            )}
          </div>
        )}

        <div className="pagination">
          <span>
            Page {page + 1} of {pageCount} · {total} saved drafts
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

      {/* Snapshot Modal */}
      {viewingDraft && (
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
              maxHeight: '88vh',
            }}
          >
            <div
              style={{
                padding: '16px 22px',
                borderBottom: '1px solid #f2e4e4',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <span style={{ fontSize: '10px', color: '#9e3258', fontWeight: 700, textTransform: 'uppercase' }}>
                  {viewingDraft.lifecycleEvent}
                </span>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#33242e' }}>
                  Draft Snapshot Record
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setViewingDraft(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#88747f' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '20px 22px', overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '16px', fontSize: '12px' }}>
                <div>
                  <span style={{ color: '#88747f', display: 'block', fontSize: '10px' }}>Recipient:</span>
                  <b>{viewingDraft.recipientName || 'Team Member'} &lt;{viewingDraft.recipientEmail}&gt;</b>
                </div>
                <div>
                  <span style={{ color: '#88747f', display: 'block', fontSize: '10px' }}>Prepared At:</span>
                  <b>{fmt(viewingDraft.preparedAt)}</b>
                </div>
                <div>
                  <span style={{ color: '#88747f', display: 'block', fontSize: '10px' }}>Current Status:</span>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px' }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: 700,
                        background: STATUS_LABELS[viewingDraft.status]?.bg || '#eee',
                        color: STATUS_LABELS[viewingDraft.status]?.color || '#333',
                      }}
                    >
                      {STATUS_LABELS[viewingDraft.status]?.label || viewingDraft.status}
                    </span>
                    <AnimatedSelect
                      variant="filter"
                      value={viewingDraft.status}
                      onChange={val => handleUpdateStatus(viewingDraft.id, val as EmailDraftStatus)}
                      options={[
                        { value: 'prepared', label: 'Prepared' },
                        { value: 'gmail_opened', label: 'Gmail Opened' },
                        { value: 'sent_unconfirmed', label: 'Sent (Unconfirmed)' },
                        { value: 'cancelled', label: 'Cancelled' },
                      ]}
                      style={{ minWidth: '150px' }}
                    />
                  </div>
                </div>
                <div>
                  <span style={{ color: '#88747f', display: 'block', fontSize: '10px' }}>Template:</span>
                  <b>{viewingDraft.templateName || 'Custom'}</b>
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <span style={{ color: '#88747f', display: 'block', fontSize: '11px', fontWeight: 600, marginBottom: '4px' }}>
                  Subject Snapshot:
                </span>
                <div style={{ padding: '8px 12px', background: '#f8f4f6', borderRadius: '8px', fontSize: '13px', fontWeight: 600 }}>
                  {viewingDraft.subjectSnapshot}
                </div>
              </div>

              <div>
                <span style={{ color: '#88747f', display: 'block', fontSize: '11px', fontWeight: 600, marginBottom: '4px' }}>
                  Body Snapshot:
                </span>
                <pre
                  style={{
                    margin: 0,
                    padding: '14px',
                    background: '#f8f4f6',
                    borderRadius: '8px',
                    fontSize: '12px',
                    lineHeight: 1.6,
                    fontFamily: 'inherit',
                    whiteSpace: 'pre-wrap',
                    color: '#2d1e28',
                  }}
                >
                  {viewingDraft.bodySnapshot}
                </pre>
              </div>
            </div>

            <div
              style={{
                padding: '14px 22px',
                borderTop: '1px solid #f2e4e4',
                display: 'flex',
                justifyContent: 'space-between',
                background: '#fffdfd',
              }}
            >
              <button
                type="button"
                className="secondary-action"
                onClick={() =>
                  handleCopy(`To: ${viewingDraft.recipientEmail}\nSubject: ${viewingDraft.subjectSnapshot}\n\n${viewingDraft.bodySnapshot}`)
                }
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {copied ? <Check size={14} style={{ color: '#16a34a' }} /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy Snapshot'}
              </button>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => setViewingDraft(null)}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="primary-action"
                  onClick={() => handleReopenInGmail(viewingDraft)}
                >
                  <ExternalLink size={14} /> Reopen in Gmail
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
