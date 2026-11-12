import React, { useMemo, useRef } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  FolderOpen,
  Play,
  SkipForward,
  Upload,
} from 'lucide-react';
import {
  ActivityLogItem,
  BatchQueueState,
  Contact,
  EmailTemplate,
} from '../types/mailpilot';
import { EMAIL_APP_OPTIONS } from '../utils/emailLauncher';
import {
  buildBrandGroups,
  getPreferredRecipientForBrand,
  getQueueBrandGroups,
} from '../utils/brandQueue';

interface DashboardViewProps {
  contacts: Contact[];
  templates: EmailTemplate[];
  batchState: BatchQueueState;
  activityLog: ActivityLogItem[];
  onOpenImportModal: () => void;
  onQuickFileUpload: (file: File) => void;
  onLoadSampleDataset: () => void;
  onContinueCampaign: () => void;
  onNavigateToContacts: (filter?: string) => void;
  onNavigateToTemplates: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  contacts,
  templates,
  batchState,
  activityLog,
  onOpenImportModal,
  onQuickFileUpload,
  onLoadSampleDataset,
  onContinueCampaign,
  onNavigateToContacts,
  onNavigateToTemplates,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const allBrands = useMemo(() => buildBrandGroups(contacts), [contacts]);
  const queueBrands = useMemo(() => getQueueBrandGroups(contacts), [contacts]);

  const totalBrands = allBrands.length;
  const completedBrands = allBrands.filter(
    (b) => b.status === 'Completed'
  ).length;
  const pendingEmails = contacts.filter(
    (c) => (c.status === 'Pending' || c.status === 'Prepared') && !c.excluded
  ).length;
  const sentEmails = contacts.filter(
    (c) => c.status === 'Marked as Sent'
  ).length;
  const skippedEmails = contacts.filter((c) => c.status === 'Skipped').length;
  const invalidEmails = contacts.filter(
    (c) => c.status === 'Invalid' || c.validationFlags.invalidEmail
  ).length;

  const activeTemplate =
    templates.find((t) => t.id === batchState.selectedTemplateId) ||
    templates.find((t) => t.isDefault) ||
    templates[0];

  const activeEmailApp =
    EMAIL_APP_OPTIONS.find((a) => a.id === batchState.selectedEmailApp) ||
    EMAIL_APP_OPTIONS[0];

  const currentBrandIndex = useMemo(() => {
    if (queueBrands.length === 0) return 0;
    if (batchState.currentBrandId) {
      const idx = queueBrands.findIndex(
        (b) => b.brandId === batchState.currentBrandId
      );
      if (idx !== -1) return idx;
    }
    return 0;
  }, [queueBrands, batchState.currentBrandId]);

  const currentQueueBrand = queueBrands[currentBrandIndex] || null;
  const currentQueueRecipient = useMemo(() => {
    if (!currentQueueBrand) return null;
    if (batchState.currentRecipientId) {
      const matched = currentQueueBrand.recipients.find(
        (r) => r.id === batchState.currentRecipientId
      );
      if (matched) return matched;
    }
    return getPreferredRecipientForBrand(currentQueueBrand);
  }, [currentQueueBrand, batchState.currentRecipientId]);

  const recipientIdxInBrand = useMemo(() => {
    if (!currentQueueBrand || !currentQueueRecipient) return 0;
    const idx = currentQueueBrand.recipients.findIndex(
      (r) => r.id === currentQueueRecipient.id
    );
    return idx !== -1 ? idx : 0;
  }, [currentQueueBrand, currentQueueRecipient]);

  return (
    <div className="space-y-8">
      {/* Primary Action Strip */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-stretch">
        {/* Import Contacts Card */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) onQuickFileUpload(f);
          }}
          className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 lg:col-span-7 dark:border-slate-800 dark:bg-slate-900"
        >
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Import Brand Outreach Contacts
            </h2>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onQuickFileUpload(file);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 whitespace-nowrap shrink-0"
            >
              <Upload className="h-4 w-4" />
              <span>Upload Excel / CSV</span>
            </button>
            <button
              type="button"
              onClick={onOpenImportModal}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <FolderOpen className="h-4 w-4" />
              <span>Column Mapper & Preview</span>
            </button>
            <button
              type="button"
              onClick={onLoadSampleDataset}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <FileSpreadsheet className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span>Load 50 Brands</span>
            </button>
          </div>
        </div>

        {/* Continue Campaign Card */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
          <div>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {sentEmails > 0 || currentBrandIndex > 0
                  ? 'Continue Campaign'
                  : 'Outreach Queue'}
              </h2>
              {queueBrands.length > 0 && (
                <span className="font-mono text-xs font-medium text-slate-500 tabular-nums dark:text-slate-400">
                  Brand {currentBrandIndex + 1} / {queueBrands.length}
                </span>
              )}
            </div>

            {currentQueueBrand && currentQueueRecipient ? (
              <div className="mt-4 space-y-2 text-xs text-slate-600 dark:text-slate-400">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
                  <span>Brand</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {currentQueueBrand.brandName} ({currentQueueBrand.emailsSent}/
                    {currentQueueBrand.validEmailCount} sent)
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
                  <span>
                    Recipient ({recipientIdxInBrand + 1}/
                    {currentQueueBrand.totalEmailsFound})
                  </span>
                  <span className="font-mono font-medium text-slate-900 dark:text-slate-100">
                    {currentQueueRecipient.email}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
                  <span>Template</span>
                  <button
                    type="button"
                    onClick={onNavigateToTemplates}
                    className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {activeTemplate?.name || 'Default'}
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <span>Client</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {activeEmailApp.shortLabel}
                  </span>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                No active brands in queue.
              </p>
            )}
          </div>

          <div className="mt-6">
            <button
              type="button"
              disabled={queueBrands.length === 0}
              onClick={onContinueCampaign}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap shrink-0 dark:bg-blue-600 dark:hover:bg-blue-700"
            >
              <Play className="h-3.5 w-3.5" />
              <span>
                {sentEmails > 0 || currentBrandIndex > 0
                  ? 'Resume Batch'
                  : 'Start Batch'}
              </span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Dynamic Statistics Grid */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
          Overview
        </h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <button
            type="button"
            onClick={() => onNavigateToContacts('all')}
            className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 text-left transition-colors hover:border-blue-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500"
          >
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>Total Brands</span>
              <FileSpreadsheet className="h-4 w-4 text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400" />
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <p className="font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {totalBrands}
              </p>
              <span className="font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
                {completedBrands} done · {contacts.length} emails
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigateToContacts('Pending')}
            className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 text-left transition-colors hover:border-blue-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500"
          >
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>Pending Emails</span>
              <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <p className="mt-3 font-mono text-2xl font-semibold tabular-nums text-blue-600 dark:text-blue-400">
              {pendingEmails}
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigateToContacts('Marked as Sent')}
            className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 text-left transition-colors hover:border-emerald-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-500"
          >
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>Emails Sent</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="mt-3 font-mono text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
              {sentEmails}
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigateToContacts('Needs Attention')}
            className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 text-left transition-colors hover:border-amber-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-amber-500"
          >
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>Skipped</span>
              <SkipForward className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <p className="mt-3 font-mono text-2xl font-semibold tabular-nums text-amber-600 dark:text-amber-400">
              {skippedEmails}
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigateToContacts('Invalid')}
            className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 text-left transition-colors hover:border-red-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-red-500"
          >
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>Invalid</span>
              <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
            </div>
            <p className="mt-3 font-mono text-2xl font-semibold tabular-nums text-red-600 dark:text-red-400">
              {invalidEmails}
            </p>
          </button>
        </div>
      </div>

      {/* Recent Activity Section */}
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Recent Activity
          </h3>
          {contacts.length > 0 && (
            <button
              type="button"
              onClick={() => onNavigateToContacts('all')}
              className="text-xs font-medium text-blue-600 hover:underline whitespace-nowrap shrink-0 dark:text-blue-400"
            >
              View All
            </button>
          )}
        </div>

        {activityLog.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No recent activity
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {activityLog.slice(0, 10).map((item) => (
              <div
                key={item.id}
                className="flex flex-col justify-between gap-2 px-6 py-3.5 sm:flex-row sm:items-center"
              >
                <div>
                  <p className="text-xs font-medium text-slate-900 dark:text-slate-100">
                    {item.title}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {item.detail}
                  </p>
                </div>
                <div className="font-mono text-xs text-slate-400 tabular-nums shrink-0">
                  {new Date(item.timestamp).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
