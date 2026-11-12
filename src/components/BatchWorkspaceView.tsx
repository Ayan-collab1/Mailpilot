import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
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
  BrandGroup,
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
import {
  formatRecipientStatusLabel,
  getPreferredRecipientForBrand,
  getQueueBrandGroups,
} from '../utils/brandQueue';

interface BatchWorkspaceViewProps {
  contacts: Contact[];
  templates: EmailTemplate[];
  batchState: BatchQueueState;
  onUpdateBatchState: (updates: Partial<BatchQueueState>) => void;
  onUpdateContact: (contactId: string, updates: Partial<Contact>) => void;
  onMarkContactStatus: (
    contact: Contact,
    status: 'Prepared' | 'Marked as Sent' | 'Skipped',
    subjectUsed: string
  ) => void;
  onSkipRemainingInBrand: (brand: BrandGroup, subjectTemplate: string) => void;
  onConfirmAdvanceFromNeedsAttentionBrand: (brandId: string) => void;
  onOpenImportModal: () => void;
}

export const BatchWorkspaceView: React.FC<BatchWorkspaceViewProps> = ({
  contacts,
  templates,
  batchState,
  onUpdateBatchState,
  onUpdateContact,
  onMarkContactStatus,
  onSkipRemainingInBrand,
  onConfirmAdvanceFromNeedsAttentionBrand,
  onOpenImportModal,
}) => {
  const [launchFeedback, setLaunchFeedback] = useState<{
    message: string;
    composeUrl: string;
    fallbackMailto: string;
    wasDuplicatePrepareWarning?: boolean;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [confirmSkipBrand, setConfirmSkipBrand] = useState(false);

  const allQueueBrands = useMemo(() => {
    return getQueueBrandGroups(contacts);
  }, [contacts]);

  // Apply 50-brand batch window if enabled
  const activeQueueBrands = useMemo(() => {
    if (!batchState.batchBrandLimit) return allQueueBrands;
    const start = batchState.batchBrandOffset || 0;
    return allQueueBrands.slice(start, start + batchState.batchBrandLimit);
  }, [allQueueBrands, batchState.batchBrandLimit, batchState.batchBrandOffset]);

  // Resolve current brand
  const currentBrandIndex = useMemo(() => {
    if (activeQueueBrands.length === 0) return 0;
    if (batchState.currentBrandId) {
      const idx = activeQueueBrands.findIndex(
        (b) => b.brandId === batchState.currentBrandId
      );
      if (idx !== -1) return idx;
    }
    return 0;
  }, [activeQueueBrands, batchState.currentBrandId]);

  const currentBrand: BrandGroup | null =
    activeQueueBrands[currentBrandIndex] || null;

  // Resolve current recipient inside the current brand
  const currentRecipient: Contact | null = useMemo(() => {
    if (!currentBrand) return null;
    if (batchState.currentRecipientId) {
      const matched = currentBrand.recipients.find(
        (r) => r.id === batchState.currentRecipientId
      );
      if (matched) return matched;
    }
    return getPreferredRecipientForBrand(currentBrand);
  }, [currentBrand, batchState.currentRecipientId]);

  const currentRecipientIdxInBrand = useMemo(() => {
    if (!currentBrand || !currentRecipient) return 0;
    const idx = currentBrand.recipients.findIndex(
      (r) => r.id === currentRecipient.id
    );
    return idx !== -1 ? idx : 0;
  }, [currentBrand, currentRecipient]);

  const selectedTemplate = useMemo(() => {
    return (
      templates.find((t) => t.id === batchState.selectedTemplateId) ||
      templates.find((t) => t.isDefault) ||
      templates[0]
    );
  }, [templates, batchState.selectedTemplateId]);

  const personalized = useMemo(() => {
    if (!currentRecipient || !selectedTemplate) {
      return {
        to: '',
        brandName: '',
        subject: '',
        body: '',
      };
    }
    return personalizeTemplate(selectedTemplate, currentRecipient);
  }, [currentRecipient, selectedTemplate]);

  const composeLinks = useMemo(() => {
    return buildEmailComposeUrl(batchState.selectedEmailApp, personalized);
  }, [batchState.selectedEmailApp, personalized]);

  const isCurrentEmailValid = currentRecipient
    ? isValidEmailAddress(currentRecipient.email)
    : false;

  const alreadyPrepared = currentRecipient
    ? batchState.preparedContactIds.includes(currentRecipient.id) ||
      currentRecipient.status === 'Prepared'
    : false;

  const selectBrandByIndex = (nextBrandIdx: number) => {
    if (activeQueueBrands.length === 0) return;
    const bounded = Math.min(
      Math.max(0, nextBrandIdx),
      activeQueueBrands.length - 1
    );
    const targetBrand = activeQueueBrands[bounded];
    if (!targetBrand) return;
    const preferredRecipient = getPreferredRecipientForBrand(targetBrand);
    setLaunchFeedback(null);
    setConfirmSkipBrand(false);
    onUpdateBatchState({
      currentBrandId: targetBrand.brandId,
      currentRecipientId: preferredRecipient?.id || null,
      lastUpdated: new Date().toISOString(),
    });
  };

  const selectRecipientInBrand = (recipient: Contact) => {
    if (!currentBrand) return;
    setLaunchFeedback(null);
    onUpdateBatchState({
      currentBrandId: currentBrand.brandId,
      currentRecipientId: recipient.id,
      lastUpdated: new Date().toISOString(),
    });
  };

  const handleOpenEmailApp = (forceReopen = false) => {
    if (!currentRecipient || !selectedTemplate) return;

    if (!isCurrentEmailValid) {
      setLaunchFeedback({
        message:
          'Invalid email address. Please correct the recipient email first.',
        composeUrl: '',
        fallbackMailto: '',
      });
      return;
    }

    if (
      (alreadyPrepared || currentRecipient.status === 'Marked as Sent') &&
      !forceReopen
    ) {
      setLaunchFeedback({
        message:
          currentRecipient.status === 'Marked as Sent'
            ? `${currentRecipient.email} is already marked as sent.`
            : `${currentRecipient.email} was already prepared.`,
        composeUrl: composeLinks.url,
        fallbackMailto: composeLinks.fallbackMailto,
        wasDuplicatePrepareWarning: true,
      });
      return;
    }

    const res = launchEmailApplication(batchState.selectedEmailApp, personalized);
    onMarkContactStatus(currentRecipient, 'Prepared', personalized.subject);
    setLaunchFeedback({
      message: res.message,
      composeUrl: res.composeUrl,
      fallbackMailto: res.fallbackMailto,
    });
  };

  const handleMarkAsSent = () => {
    if (!currentRecipient) return;
    setLaunchFeedback(null);
    setConfirmSkipBrand(false);
    onMarkContactStatus(currentRecipient, 'Marked as Sent', personalized.subject);
  };

  const handleSkipRecipient = () => {
    if (!currentRecipient) return;
    setLaunchFeedback(null);
    setConfirmSkipBrand(false);
    onMarkContactStatus(currentRecipient, 'Skipped', personalized.subject);
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

  if (activeQueueBrands.length === 0 || !currentBrand || !currentRecipient) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-blue-600 dark:border-slate-800 dark:bg-slate-800 dark:text-blue-400">
          <Mail className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
          No Brands in Queue
        </h2>
        <button
          type="button"
          onClick={onOpenImportModal}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700"
        >
          <Upload className="h-3.5 w-3.5" />
          <span>Import Contacts</span>
        </button>
      </div>
    );
  }

  const totalBrandsInQueue = activeQueueBrands.length;
  const completedBrandsInQueue = activeQueueBrands.filter(
    (b) => b.status === 'Completed'
  ).length;
  const brandProgressPercent =
    currentBrand.validEmailCount > 0
      ? Math.round(
          (currentBrand.emailsSent / currentBrand.validEmailCount) * 100
        )
      : 0;

  // Check if current brand has no pending recipients left, but has skipped recipients requiring confirmation
  const brandNeedsSkipResolution =
    currentBrand.emailsRemaining === 0 &&
    currentBrand.emailsSkipped > 0 &&
    !batchState.acknowledgedBrandIds.includes(currentBrand.brandId);

  const hasCustomOverride =
    currentRecipient.customSubject !== undefined ||
    currentRecipient.customBody !== undefined;

  const total50Chunks = Math.ceil(allQueueBrands.length / 50);

  return (
    <div className="space-y-6">
      {/* Top Queue Navigation Bar (Brand Level) */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-500 dark:text-slate-400">
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Batch Workspace
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono font-medium text-blue-600 tabular-nums dark:text-blue-400">
              Brand {currentBrandIndex + 1} of {totalBrandsInQueue}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono font-medium text-slate-700 tabular-nums dark:text-slate-300">
              Recipient {currentRecipientIdxInBrand + 1} of{' '}
              {currentBrand.totalEmailsFound}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {completedBrandsInQueue}/{totalBrandsInQueue} brands completed
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {allQueueBrands.length > 50 && (
              <select
                value={
                  batchState.batchBrandLimit === 50
                    ? String(Math.floor(batchState.batchBrandOffset / 50))
                    : 'all'
                }
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'all') {
                    onUpdateBatchState({
                      batchBrandLimit: null,
                      batchBrandOffset: 0,
                      lastUpdated: new Date().toISOString(),
                    });
                  } else {
                    const chunkIdx = Number(val);
                    const offset = chunkIdx * 50;
                    const firstBrand = allQueueBrands[offset];
                    const firstRec = firstBrand
                      ? getPreferredRecipientForBrand(firstBrand)
                      : null;
                    onUpdateBatchState({
                      batchBrandLimit: 50,
                      batchBrandOffset: offset,
                      currentBrandId: firstBrand?.brandId || null,
                      currentRecipientId: firstRec?.id || null,
                      lastUpdated: new Date().toISOString(),
                    });
                  }
                }}
                aria-label="Select 50-brand batch"
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-medium text-slate-800 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="all">
                  All Brands ({allQueueBrands.length})
                </option>
                {Array.from({ length: total50Chunks }).map((_, idx) => {
                  const start = idx * 50 + 1;
                  const end = Math.min((idx + 1) * 50, allQueueBrands.length);
                  return (
                    <option key={idx} value={String(idx)}>
                      Batch {idx + 1}: Brands {start}–{end}
                    </option>
                  );
                })}
              </select>
            )}

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
                  <span>Resume</span>
                </>
              ) : (
                <>
                  <Pause className="h-3.5 w-3.5 text-amber-600" />
                  <span>Pause</span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled={currentBrandIndex <= 0}
              onClick={() => selectBrandByIndex(currentBrandIndex - 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Prev Brand</span>
            </button>

            <select
              value={currentBrandIndex}
              onChange={(e) => selectBrandByIndex(Number(e.target.value))}
              aria-label="Jump to brand in queue"
              className="max-w-56 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 font-mono text-xs text-slate-800 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              {activeQueueBrands.map((b, idx) => (
                <option key={b.brandId} value={idx}>
                  #{idx + 1} — {b.brandName} ({b.emailsSent}/{b.validEmailCount}{' '}
                  · {b.status === 'Completed' ? '✓ COMPLETED' : b.status.toUpperCase()})
                </option>
              ))}
            </select>

            <button
              type="button"
              disabled={
                currentBrandIndex >= totalBrandsInQueue - 1 ||
                currentBrand.emailsRemaining > 0
              }
              title={
                currentBrand.emailsRemaining > 0
                  ? 'Finish or skip pending recipients in the current brand first'
                  : 'Move to next brand'
              }
              onClick={() => selectBrandByIndex(currentBrandIndex + 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <span>Next Brand</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {batchState.isPaused && (
        <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/70 px-5 py-3 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
          <span>
            Paused at {currentBrand.brandName} — Recipient{' '}
            {currentRecipientIdxInBrand + 1} of {currentBrand.totalEmailsFound}
          </span>
          <button
            type="button"
            onClick={() => onUpdateBatchState({ isPaused: false })}
            className="rounded-lg bg-amber-600 px-3 py-1.5 font-medium text-white hover:bg-amber-700 whitespace-nowrap shrink-0"
          >
            Resume
          </button>
        </div>
      )}

      {/* Compact Brand Progress Card (Section 5) */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {currentBrand.status === 'Completed'
                ? `${currentBrand.brandName} ✓ COMPLETED`
                : currentBrand.brandName}
            </h2>
            <span
              className={`font-mono text-xs font-semibold uppercase tracking-wider ${
                currentBrand.status === 'Completed'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : currentBrand.status === 'Needs Attention'
                  ? 'text-amber-600 dark:text-amber-400'
                  : currentBrand.status === 'In Progress'
                  ? 'text-blue-600 dark:text-blue-400'
                  : currentBrand.status === 'Invalid'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              Status: {currentBrand.status.toUpperCase()}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4 font-mono text-xs tabular-nums">
            <div>
              <span className="text-slate-500 dark:text-slate-400">
                Emails Found:{' '}
              </span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {currentBrand.totalEmailsFound}
              </span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">
                Emails Sent:{' '}
              </span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {currentBrand.emailsSent}
              </span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">
                Remaining:{' '}
              </span>
              <span className="font-semibold text-blue-600 dark:text-blue-400">
                {currentBrand.emailsRemaining}
              </span>
            </div>
            {currentBrand.emailsSkipped > 0 && (
              <div>
                <span className="text-slate-500 dark:text-slate-400">
                  Skipped:{' '}
                </span>
                <span className="font-semibold text-amber-600 dark:text-amber-400">
                  {currentBrand.emailsSkipped}
                </span>
              </div>
            )}
            <div>
              <span className="text-slate-500 dark:text-slate-400">
                Progress:{' '}
              </span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {currentBrand.emailsSent}/{currentBrand.validEmailCount}
              </span>
            </div>
          </div>
        </div>

        {/* Brand Progress Bar */}
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className={`h-full transition-all duration-200 ${
              currentBrand.status === 'Completed'
                ? 'bg-emerald-600'
                : currentBrand.status === 'Needs Attention'
                ? 'bg-amber-500'
                : 'bg-blue-600'
            }`}
            style={{ width: `${brandProgressPercent}%` }}
          />
        </div>

        {/* Recipient Stepper within Current Brand */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {currentBrand.recipients.map((rec, idx) => {
            const isSelected = rec.id === currentRecipient.id;
            const label = formatRecipientStatusLabel(rec.status);
            return (
              <button
                key={rec.id}
                type="button"
                onClick={() => selectRecipientInBrand(rec)}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 font-mono text-xs transition-colors ${
                  isSelected
                    ? 'border-blue-600 bg-blue-50/70 text-blue-700 font-semibold dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-300'
                    : 'border-slate-200 bg-slate-50/60 text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300'
                }`}
              >
                <span className="tabular-nums">
                  {idx + 1}/{currentBrand.totalEmailsFound}
                </span>
                <span className="max-w-44 truncate">{rec.email || 'Empty'}</span>
                <span
                  className={
                    rec.status === 'Marked as Sent'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : rec.status === 'Skipped'
                      ? 'text-amber-600 dark:text-amber-400'
                      : rec.status === 'Invalid'
                      ? 'text-red-600 dark:text-red-400'
                      : rec.status === 'Prepared'
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-slate-400'
                  }
                >
                  · {label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Needs Attention Resolution Bar (when skipped recipients exist and 0 pending remain) */}
        {brandNeedsSkipResolution && (
          <div className="mt-4 flex flex-col justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3.5 sm:flex-row sm:items-center dark:border-amber-900/60 dark:bg-amber-950/30">
            <div className="flex items-center gap-2 text-xs font-medium text-amber-800 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                {currentBrand.brandName} has {currentBrand.emailsSkipped} skipped{' '}
                {currentBrand.emailsSkipped === 1 ? 'recipient' : 'recipients'}.
                Status: NEEDS ATTENTION.
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const skippedRec = currentBrand.recipients.find(
                    (r) => r.status === 'Skipped'
                  );
                  if (skippedRec) {
                    selectRecipientInBrand(skippedRec);
                  }
                }}
                className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-slate-900 dark:text-amber-300"
              >
                Review Skipped ({currentBrand.emailsSkipped})
              </button>
              <button
                type="button"
                onClick={() =>
                  onConfirmAdvanceFromNeedsAttentionBrand(currentBrand.brandId)
                }
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
              >
                <Check className="h-3.5 w-3.5" />
                <span>Confirm & Next Brand</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Split Workspace */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-stretch">
        {/* Left Column: Recipient & Configuration */}
        <div className="flex flex-col justify-between space-y-5 rounded-xl border border-slate-200 bg-white p-6 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Recipient {currentRecipientIdxInBrand + 1} of{' '}
                  {currentBrand.totalEmailsFound}
                </h3>
              </div>
              <span
                className={`text-xs font-medium ${
                  currentRecipient.status === 'Marked as Sent'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : currentRecipient.status === 'Prepared'
                    ? 'text-blue-600 dark:text-blue-400'
                    : currentRecipient.status === 'Skipped'
                    ? 'text-amber-600 dark:text-amber-400'
                    : currentRecipient.status === 'Invalid'
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {formatRecipientStatusLabel(currentRecipient.status)}
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Brand Name
              </label>
              <input
                type="text"
                value={currentRecipient.brandName}
                onChange={(e) => {
                  const val = e.target.value;
                  onUpdateContact(currentRecipient.id, {
                    brandName: val,
                    validationFlags: {
                      ...currentRecipient.validationFlags,
                      missingBrand: val.trim().length === 0,
                    },
                  });
                }}
                placeholder="Brand name"
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Recipient Email ({currentRecipientIdxInBrand + 1}/
                  {currentBrand.totalEmailsFound})
                </label>
                {!isCurrentEmailValid && (
                  <span className="text-xs font-medium text-red-600 dark:text-red-400">
                    Invalid email
                  </span>
                )}
              </div>
              <input
                type="email"
                value={currentRecipient.email}
                onChange={(e) => {
                  const val = e.target.value;
                  const valid = isValidEmailAddress(val);
                  onUpdateContact(currentRecipient.id, {
                    email: val,
                    excluded: !valid ? true : false,
                    status: !valid
                      ? 'Invalid'
                      : currentRecipient.status === 'Invalid'
                      ? 'Pending'
                      : currentRecipient.status,
                    validationFlags: {
                      ...currentRecipient.validationFlags,
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

            {(currentBrand.phone ||
              currentBrand.websiteNotes ||
              currentBrand.sourceList) && (
              <div className="grid grid-cols-1 gap-2 rounded-lg border border-slate-100 bg-slate-50/60 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/40">
                {currentBrand.phone && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">Phone</span>
                    <span className="font-mono text-slate-800 dark:text-slate-200">
                      {currentBrand.phone}
                    </span>
                  </div>
                )}
                {currentBrand.websiteNotes && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">Notes</span>
                    <span className="truncate font-medium text-slate-800 dark:text-slate-200">
                      {currentBrand.websiteNotes}
                    </span>
                  </div>
                )}
                {currentBrand.sourceList && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">Source</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {currentBrand.sourceList}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Email Template
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

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Email Application
              </label>
              <div className="mt-1.5 grid grid-cols-1 gap-2">
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
                      className={`flex items-center justify-between rounded-lg border px-3.5 py-2.5 text-left transition-colors ${
                        active
                          ? 'border-blue-600 bg-blue-50/50 text-blue-700 font-medium dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-300'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span className="text-xs">{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Email Preview & Batch Controls */}
        <div className="flex flex-col justify-between space-y-5 rounded-xl border border-slate-200 bg-white p-6 lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Email Preview
              </h3>
              {hasCustomOverride && (
                <button
                  type="button"
                  onClick={() =>
                    onUpdateContact(currentRecipient.id, {
                      customSubject: undefined,
                      customBody: undefined,
                    })
                  }
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Reset</span>
                </button>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Subject
              </label>
              <input
                type="text"
                value={personalized.subject}
                onChange={(e) =>
                  onUpdateContact(currentRecipient.id, {
                    customSubject: e.target.value,
                  })
                }
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Message
              </label>
              <textarea
                rows={9}
                value={personalized.body}
                onChange={(e) =>
                  onUpdateContact(currentRecipient.id, {
                    customBody: e.target.value,
                  })
                }
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs leading-relaxed text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            {/* Copy Fallback Controls */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleCopyText('recipient', personalized.to)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>
                  {copiedField === 'recipient'
                    ? 'Copied Recipient'
                    : 'Copy Recipient'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleCopyText('subject', personalized.subject)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>
                  {copiedField === 'subject'
                    ? 'Copied Subject'
                    : 'Copy Subject'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleCopyText('body', personalized.body)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>
                  {copiedField === 'body' ? 'Copied Message' : 'Copy Message'}
                </span>
              </button>
            </div>

            {launchFeedback && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs dark:border-slate-700 dark:bg-slate-800/70">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {launchFeedback.wasDuplicatePrepareWarning ? (
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    ) : (
                      <ExternalLink className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                    )}
                    <span className="text-slate-700 dark:text-slate-200">
                      {launchFeedback.message}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {launchFeedback.wasDuplicatePrepareWarning && (
                      <button
                        type="button"
                        onClick={() => handleOpenEmailApp(true)}
                        className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                      >
                        Re-open
                      </button>
                    )}
                    {launchFeedback.fallbackMailto && (
                      <a
                        href={launchFeedback.fallbackMailto}
                        target="_top"
                        rel="noopener noreferrer"
                        className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                      >
                        Direct Mailto Link
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Primary Batch Action Bar */}
          <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => handleOpenEmailApp(false)}
                  disabled={batchState.isPaused}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <ExternalLink className="h-4 w-4" />
                  <span>Prepare Email / Send</span>
                </button>

                <button
                  type="button"
                  onClick={handleMarkAsSent}
                  disabled={batchState.isPaused || !isCurrentEmailValid}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>
                    {currentBrand.emailsRemaining > 1
                      ? 'Mark as Sent & Next Recipient'
                      : 'Mark as Sent & Complete Brand'}
                  </span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSkipRecipient}
                  disabled={batchState.isPaused}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  <SkipForward className="h-4 w-4" />
                  <span>Skip Recipient</span>
                </button>

                {currentBrand.emailsRemaining > 1 && !confirmSkipBrand && (
                  <button
                    type="button"
                    onClick={() => setConfirmSkipBrand(true)}
                    disabled={batchState.isPaused}
                    className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50 whitespace-nowrap shrink-0 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300"
                  >
                    <span>Skip Remaining ({currentBrand.emailsRemaining})</span>
                  </button>
                )}
              </div>
            </div>

            {confirmSkipBrand && (
              <div className="flex flex-col justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs sm:flex-row sm:items-center dark:border-amber-900/60 dark:bg-amber-950/40">
                <span className="font-medium text-amber-800 dark:text-amber-200">
                  Skip all {currentBrand.emailsRemaining} remaining recipients
                  for {currentBrand.brandName} and move to next brand?
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setConfirmSkipBrand(false)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmSkipBrand(false);
                      onSkipRemainingInBrand(currentBrand, personalized.subject);
                    }}
                    className="rounded-lg bg-amber-600 px-3 py-1.5 font-medium text-white hover:bg-amber-700"
                  >
                    Confirm Skip Brand
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
