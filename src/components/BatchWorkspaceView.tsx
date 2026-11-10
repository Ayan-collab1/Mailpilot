import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Mail,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Upload,
} from 'lucide-react';
import {
  BatchQueueState,
  Contact,
  EmailAppType,
  EmailTemplate,
} from '../types/mailpilot';
import {
  buildEmailComposeUrl,
  EMAIL_APP_OPTIONS,
  launchEmailApplication,
  personalizeTemplate,
} from '../utils/emailLauncher';
import { isValidEmailAddress } from '../utils/excelParser';

interface BatchWorkspaceViewProps {
  contacts: Contact[];
  templates: EmailTemplate[];
  batchState: BatchQueueState;
  onUpdateBatchState: (updates: Partial<BatchQueueState>) => void;
  onUpdateContact: (contactId: string, updates: Partial<Contact>) => void;
  onMarkContactStatus: (
    contact: Contact,
    status: 'Prepared' | 'Marked as Sent' | 'Skipped',
    subjectUsed: string,
    advanceNext: boolean
  ) => void;
  onOpenImportModal: () => void;
}

export const BatchWorkspaceView: React.FC<BatchWorkspaceViewProps> = ({
  contacts,
  templates,
  batchState,
  onUpdateBatchState,
  onUpdateContact,
  onMarkContactStatus,
  onOpenImportModal,
}) => {
  const [launchFeedback, setLaunchFeedback] = useState<{
    message: string;
    composeUrl: string;
    fallbackMailto: string;
    wasDuplicatePrepareWarning?: boolean;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Eligible contacts in the sending queue (included & not completely empty)
  const queueContacts = useMemo(() => {
    return contacts.filter((c) => !c.excluded);
  }, [contacts]);

  const currentIndex =
    queueContacts.length > 0
      ? Math.min(Math.max(0, batchState.currentIndex), queueContacts.length - 1)
      : 0;

  const currentContact = queueContacts[currentIndex] || null;

  const selectedTemplate = useMemo(() => {
    return (
      templates.find((t) => t.id === batchState.selectedTemplateId) ||
      templates.find((t) => t.isDefault) ||
      templates[0]
    );
  }, [templates, batchState.selectedTemplateId]);

  const personalized = useMemo(() => {
    if (!currentContact || !selectedTemplate) {
      return {
        to: '',
        brandName: '',
        subject: '',
        body: '',
      };
    }
    return personalizeTemplate(selectedTemplate, currentContact);
  }, [currentContact, selectedTemplate]);

  const composeLinks = useMemo(() => {
    return buildEmailComposeUrl(batchState.selectedEmailApp, personalized);
  }, [batchState.selectedEmailApp, personalized]);

  const isCurrentEmailValid = currentContact
    ? isValidEmailAddress(currentContact.email)
    : false;

  const alreadyPrepared = currentContact
    ? batchState.preparedContactIds.includes(currentContact.id) ||
      currentContact.status === 'Prepared'
    : false;

  const goToIndex = (nextIdx: number) => {
    if (queueContacts.length === 0) return;
    const bounded = Math.min(Math.max(0, nextIdx), queueContacts.length - 1);
    setLaunchFeedback(null);
    onUpdateBatchState({
      currentIndex: bounded,
      lastUpdated: new Date().toISOString(),
    });
  };

  const handleOpenEmailApp = (forceReopen = false) => {
    if (!currentContact || !selectedTemplate) return;

    if (!isCurrentEmailValid) {
      setLaunchFeedback({
        message:
          'This contact has an invalid email format. Please correct the Recipient Email field below before opening your email client.',
        composeUrl: '',
        fallbackMailto: '',
      });
      return;
    }

    // Prevent accidentally preparing the same contact twice without noticing
    if (
      (alreadyPrepared || currentContact.status === 'Marked as Sent') &&
      !forceReopen
    ) {
      setLaunchFeedback({
        message:
          currentContact.status === 'Marked as Sent'
            ? `This contact (${currentContact.brandName}) was already marked as sent. Click "Re-open Compose Window" below if you need to open it again.`
            : `You already prepared and opened an email window for ${currentContact.brandName}. If you closed the window without sending, click "Retry / Re-open Compose Window" below, or click "Mark as Sent" if you sent it.`,
        composeUrl: composeLinks.url,
        fallbackMailto: composeLinks.fallbackMailto,
        wasDuplicatePrepareWarning: true,
      });
      return;
    }

    const res = launchEmailApplication(batchState.selectedEmailApp, personalized);
    onMarkContactStatus(currentContact, 'Prepared', personalized.subject, false);
    setLaunchFeedback({
      message: res.message,
      composeUrl: res.composeUrl,
      fallbackMailto: res.fallbackMailto,
    });
  };

  const handleMarkAsSent = () => {
    if (!currentContact) return;
    setLaunchFeedback(null);
    onMarkContactStatus(
      currentContact,
      'Marked as Sent',
      personalized.subject,
      true
    );
  };

  const handleSkipContact = () => {
    if (!currentContact) return;
    setLaunchFeedback(null);
    onMarkContactStatus(currentContact, 'Skipped', personalized.subject, true);
  };

  const handleCopyText = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(label);
      setTimeout(() => setCopiedField(null), 1800);
    } catch {
      // Ignore clipboard error
    }
  };

  if (queueContacts.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-blue-600 dark:border-slate-800 dark:bg-slate-800 dark:text-blue-400">
          <Mail className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
          No Contacts in Active Batch Queue
        </h2>
        <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          Upload an Excel (.xlsx, .xls) or CSV contact list to start processing personalized brand outreach emails one by one.
        </p>
        <button
          type="button"
          onClick={onOpenImportModal}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-700"
        >
          <Upload className="h-4 w-4" />
          <span>Import Contacts to Start</span>
        </button>
      </div>
    );
  }

  const totalInQueue = queueContacts.length;
  const completedInQueue = queueContacts.filter(
    (c) => c.status === 'Marked as Sent' || c.status === 'Skipped'
  ).length;
  const progressPercent = Math.round(((currentIndex + 1) / totalInQueue) * 100);

  const hasCustomOverride =
    currentContact.customSubject !== undefined ||
    currentContact.customBody !== undefined;

  return (
    <div className="space-y-6">
      {/* Top Progress & Queue Navigation Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                Sequential Batch Workspace
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono font-semibold text-blue-600 tabular-nums dark:text-blue-400">
                Contact {currentIndex + 1} of {totalInQueue}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {completedInQueue} processed
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              One recipient is prepared at a time. Review in your email app, click Send there, then return here to confirm.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                onUpdateBatchState({
                  isPaused: !batchState.isPaused,
                  lastUpdated: new Date().toISOString(),
                })
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              {batchState.isPaused ? (
                <>
                  <Play className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Resume Batch</span>
                </>
              ) : (
                <>
                  <Pause className="h-3.5 w-3.5 text-amber-600" />
                  <span>Pause Batch</span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled={currentIndex <= 0}
              onClick={() => goToIndex(currentIndex - 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Previous Contact</span>
            </button>

            <select
              value={currentIndex}
              onChange={(e) => goToIndex(Number(e.target.value))}
              aria-label="Jump to contact in queue"
              className="max-w-52 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 font-mono text-xs text-slate-800 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              {queueContacts.map((c, idx) => (
                <option key={c.id} value={idx}>
                  #{idx + 1} — {c.brandName || 'Unnamed'} ({c.status})
                </option>
              ))}
            </select>

            <button
              type="button"
              disabled={currentIndex >= totalInQueue - 1}
              onClick={() => goToIndex(currentIndex + 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <span>Next Contact</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className="h-full bg-blue-600 transition-transform duration-200"
            style={{
              width: `${progressPercent}%`,
            }}
          />
        </div>
      </div>

      {batchState.isPaused && (
        <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/70 px-5 py-3.5 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
          <span>
            Batch queue is currently paused at Contact {currentIndex + 1} of {totalInQueue}. Your progress is saved locally in your browser.
          </span>
          <button
            type="button"
            onClick={() => onUpdateBatchState({ isPaused: false })}
            className="rounded-lg bg-amber-600 px-3 py-1.5 font-semibold text-white hover:bg-amber-700 whitespace-nowrap shrink-0"
          >
            Resume Queue
          </button>
        </div>
      )}

      {/* Main Split Workspace: Left Configuration & Recipient | Right Email Preview & Actions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-stretch">
        {/* Left Column: Current Contact & App/Template Configuration */}
        <div className="flex flex-col justify-between space-y-5 rounded-xl border border-slate-200 bg-white p-6 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Current Recipient
                </span>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {currentContact.brandName || 'Unnamed Brand'}
                </h3>
              </div>
              <div className="text-right text-xs">
                <span className="text-slate-400">Status: </span>
                <span
                  className={
                    currentContact.status === 'Marked as Sent'
                      ? 'font-semibold text-emerald-600 dark:text-emerald-400'
                      : currentContact.status === 'Prepared'
                      ? 'font-semibold text-blue-600 dark:text-blue-400'
                      : currentContact.status === 'Skipped'
                      ? 'font-semibold text-amber-600 dark:text-amber-400'
                      : currentContact.status === 'Invalid'
                      ? 'font-semibold text-red-600 dark:text-red-400'
                      : 'font-semibold text-slate-700 dark:text-slate-300'
                  }
                >
                  {currentContact.status}
                </span>
              </div>
            </div>

            {/* Editable Brand Name & Recipient Email before opening compose window */}
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Current Brand Name
              </label>
              <input
                type="text"
                value={currentContact.brandName}
                onChange={(e) => {
                  const val = e.target.value;
                  onUpdateContact(currentContact.id, {
                    brandName: val,
                    validationFlags: {
                      ...currentContact.validationFlags,
                      missingBrand: val.trim().length === 0,
                    },
                  });
                }}
                placeholder="Enter brand name..."
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Recipient Email (Editable Correction)
                </label>
                {!isCurrentEmailValid && (
                  <span className="text-xs font-medium text-red-600 dark:text-red-400">
                    Invalid email format
                  </span>
                )}
              </div>
              <input
                type="email"
                value={currentContact.email}
                onChange={(e) => {
                  const val = e.target.value;
                  const valid = isValidEmailAddress(val);
                  onUpdateContact(currentContact.id, {
                    email: val,
                    status: !valid
                      ? 'Invalid'
                      : currentContact.status === 'Invalid'
                      ? 'Pending'
                      : currentContact.status,
                    validationFlags: {
                      ...currentContact.validationFlags,
                      invalidEmail: !valid,
                    },
                  });
                }}
                placeholder="recipient@brand.com"
                className={`mt-1.5 w-full rounded-lg border px-3 py-2 font-mono text-xs focus:outline-none ${
                  !isCurrentEmailValid
                    ? 'border-red-400 bg-red-50/40 text-red-700 dark:border-red-700 dark:bg-red-950/30 dark:text-red-300'
                    : 'border-slate-200 bg-slate-50 text-slate-900 focus:border-blue-600 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
                }`}
              />
            </div>

            {/* Selected Email Template */}
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Selected Email Template
              </label>
              <select
                value={selectedTemplate?.id || ''}
                onChange={(e) =>
                  onUpdateBatchState({
                    selectedTemplateId: e.target.value,
                    lastUpdated: new Date().toISOString(),
                  })
                }
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name} {tpl.isDefault ? '(Default)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Selected Email Application */}
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Selected Email Integration
              </label>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                Uses standard encoded <code className="font-mono">mailto:</code> links so Android can open Thunderbird or display installed compatible email apps.
              </p>
              <div className="mt-2 grid grid-cols-1 gap-2">
                {EMAIL_APP_OPTIONS.map((option) => {
                  const active = batchState.selectedEmailApp === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() =>
                        onUpdateBatchState({
                          selectedEmailApp: option.id as EmailAppType,
                          lastUpdated: new Date().toISOString(),
                        })
                      }
                      className={`flex flex-col items-start rounded-lg border p-3 text-left transition-colors ${
                        active
                          ? 'border-blue-600 bg-blue-50/50 text-slate-900 dark:border-blue-500 dark:bg-blue-950/40 dark:text-slate-100'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span className="text-xs font-semibold">{option.label}</span>
                      <span className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                        {option.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
            Note: Web browsers cannot force a specific native app to open—Android handles the <code className="font-mono">mailto:</code> intent via your default email handler (such as Thunderbird) or app chooser. Opening an email marks the contact as <strong className="font-medium text-slate-700 dark:text-slate-300">Prepared</strong>; click <strong className="font-medium text-slate-700 dark:text-slate-300">Mark as Sent</strong> only after sending inside your email app.
          </div>
        </div>

        {/* Right Column: Live Personalized Email Preview & Batch Controls */}
        <div className="flex flex-col justify-between space-y-5 rounded-xl border border-slate-200 bg-white p-6 lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Personalized Email Preview
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Recipient, subject, and body are automatically populated into the mailto intent.
                </p>
              </div>
              {hasCustomOverride && (
                <button
                  type="button"
                  onClick={() =>
                    onUpdateContact(currentContact.id, {
                      customSubject: undefined,
                      customBody: undefined,
                    })
                  }
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Reset to Saved Template</span>
                </button>
              )}
            </div>

            {/* Subject Preview / Individual Edit */}
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Email Subject
                </label>
                <button
                  type="button"
                  onClick={() => handleCopyText('subject', personalized.subject)}
                  className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  <Copy className="h-3 w-3" />
                  <span>{copiedField === 'subject' ? 'Copied Subject' : 'Copy Subject'}</span>
                </button>
              </div>
              <input
                type="text"
                value={personalized.subject}
                onChange={(e) =>
                  onUpdateContact(currentContact.id, {
                    customSubject: e.target.value,
                  })
                }
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            {/* Body Preview / Individual Edit */}
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Email Message Body
                </label>
                <button
                  type="button"
                  onClick={() => handleCopyText('body', personalized.body)}
                  className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  <Copy className="h-3 w-3" />
                  <span>{copiedField === 'body' ? 'Copied Message' : 'Copy Message'}</span>
                </button>
              </div>
              <textarea
                rows={8}
                value={personalized.body}
                onChange={(e) =>
                  onUpdateContact(currentContact.id, {
                    customBody: e.target.value,
                  })
                }
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs leading-relaxed text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            {/* Dedicated Fallback Bar: Separate Copy Recipient, Copy Subject, and Copy Message Buttons */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
              <div className="flex flex-col justify-between gap-2.5 sm:flex-row sm:items-center">
                <div>
                  <p className="text-xs font-medium text-slate-800 dark:text-slate-200">
                    Manual Fallback Controls
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    If Thunderbird or your Android email chooser does not open automatically, copy individual fields below:
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopyText('recipient', personalized.to)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>
                      {copiedField === 'recipient'
                        ? 'Copied Recipient!'
                        : 'Copy Recipient'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCopyText('subject', personalized.subject)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>
                      {copiedField === 'subject'
                        ? 'Copied Subject!'
                        : 'Copy Subject'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCopyText('body', personalized.body)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>
                      {copiedField === 'body'
                        ? 'Copied Message!'
                        : 'Copy Message'}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* Launch Status / Duplicate Warning Banner */}
            {launchFeedback && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs dark:border-slate-700 dark:bg-slate-800/70">
                <div className="flex items-start gap-2.5">
                  {launchFeedback.wasDuplicatePrepareWarning ? (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  ) : (
                    <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                  )}
                  <div className="flex-1 space-y-2">
                    <p className="text-slate-700 dark:text-slate-200">
                      {launchFeedback.message}
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                      {launchFeedback.wasDuplicatePrepareWarning && (
                        <button
                          type="button"
                          onClick={() => handleOpenEmailApp(true)}
                          className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:underline dark:text-blue-400"
                        >
                          <ExternalLink className="h-3 w-3" />
                          <span>Retry / Re-trigger Email Intent</span>
                        </button>
                      )}
                      {launchFeedback.fallbackMailto && (
                        <a
                          href={launchFeedback.fallbackMailto}
                          target="_top"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline dark:text-blue-400"
                        >
                          <span>Direct Mailto Intent Link</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Primary Batch Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => handleOpenEmailApp(false)}
                disabled={batchState.isPaused}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <ExternalLink className="h-4 w-4" />
                <span>Prepare Email / Send</span>
              </button>

              <button
                type="button"
                onClick={handleMarkAsSent}
                disabled={batchState.isPaused || !isCurrentEmailValid}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>Mark as Sent & Next</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleSkipContact}
              disabled={batchState.isPaused}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <SkipForward className="h-4 w-4" />
              <span>Skip Contact</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
