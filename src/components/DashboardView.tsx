import React, { useRef } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  FolderOpen,
  Play,
  SkipForward,
  Upload,
  AlertCircle,
} from 'lucide-react';
import {
  ActivityLogItem,
  BatchQueueState,
  Contact,
  EmailTemplate,
} from '../types/mailpilot';
import { EMAIL_APP_OPTIONS } from '../utils/emailLauncher';

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

  const totalBrands = contacts.length;
  const pendingEmails = contacts.filter(
    (c) => (c.status === 'Pending' || c.status === 'Prepared') && !c.excluded
  ).length;
  const sentEmails = contacts.filter((c) => c.status === 'Marked as Sent').length;
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

  const eligibleQueue = contacts.filter(
    (c) => !c.excluded && c.status !== 'Invalid'
  );
  const clampedIndex =
    eligibleQueue.length > 0
      ? Math.min(batchState.currentIndex, eligibleQueue.length - 1)
      : 0;
  const currentQueueContact = eligibleQueue[clampedIndex] || null;

  return (
    <div className="space-y-8">
      {/* Primary Action Strip: Import Contacts & Continue Campaign */}
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
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Contact Database Setup
              </span>
              <span className="font-mono text-xs text-slate-400 tabular-nums">
                .xlsx · .xls · .csv
              </span>
            </div>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Import Brand Outreach Contacts
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Upload an Excel or CSV spreadsheet containing brand names and email addresses. MailPilot automatically detects columns, validates addresses, and prepares your sequential queue.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3 pt-2">
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
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 whitespace-nowrap shrink-0"
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
              <span>Load 50-Brand Sample</span>
            </button>
          </div>
        </div>

        {/* Continue Campaign Card */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
          <div>
            <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>Batch Sending Queue</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {eligibleQueue.length > 0
                  ? `Contact ${clampedIndex + 1} of ${eligibleQueue.length}`
                  : 'Queue Empty'}
              </span>
            </div>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              {sentEmails > 0 || batchState.currentIndex > 0
                ? 'Continue Campaign'
                : 'Start Outreach Campaign'}
            </h2>

            {currentQueueContact ? (
              <div className="mt-3 space-y-2 text-xs text-slate-600 dark:text-slate-400">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
                  <span>Next Recipient:</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {currentQueueContact.brandName || 'Unnamed Brand'} ({currentQueueContact.email})
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
                  <span>Active Template:</span>
                  <button
                    type="button"
                    onClick={onNavigateToTemplates}
                    className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {activeTemplate?.name || 'Default Template'}
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <span>Email Client:</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {activeEmailApp.shortLabel}
                  </span>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Import a spreadsheet or load the 50-brand sample dataset to activate your sequential batch workspace.
              </p>
            )}
          </div>

          <div className="mt-6 pt-2">
            <button
              type="button"
              disabled={eligibleQueue.length === 0}
              onClick={onContinueCampaign}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap shrink-0 dark:bg-blue-600 dark:hover:bg-blue-700"
            >
              <Play className="h-3.5 w-3.5" />
              <span>
                {sentEmails > 0 || batchState.currentIndex > 0
                  ? `Resume Batch (Contact ${clampedIndex + 1} of ${eligibleQueue.length})`
                  : `Open Batch Workspace (${eligibleQueue.length} Ready)`}
              </span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Dynamic Statistics Grid (5 Required Metrics) */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Campaign Overview
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Real-time local metrics
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <button
            type="button"
            onClick={() => onNavigateToContacts('all')}
            className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 text-left transition-colors hover:border-blue-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500"
          >
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Total Brands Imported</span>
              <FileSpreadsheet className="h-4 w-4 text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400" />
            </div>
            <p className="mt-3 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {totalBrands}
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigateToContacts('Pending')}
            className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 text-left transition-colors hover:border-blue-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500"
          >
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
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
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Marked as Sent</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="mt-3 font-mono text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
              {sentEmails}
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigateToContacts('Skipped')}
            className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 text-left transition-colors hover:border-amber-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-amber-500"
          >
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Skipped Emails</span>
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
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Invalid Addresses</span>
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
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Recent Activity
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Latest spreadsheet imports and manual outreach confirmations
            </p>
          </div>
          {contacts.length > 0 && (
            <button
              type="button"
              onClick={() => onNavigateToContacts('all')}
              className="text-xs font-medium text-blue-600 hover:underline whitespace-nowrap shrink-0 dark:text-blue-400"
            >
              View All Contacts
            </button>
          )}
        </div>

        {activityLog.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              No outreach activity recorded yet
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Upload an Excel or CSV file above or load the 50-brand sample dataset to begin.
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
