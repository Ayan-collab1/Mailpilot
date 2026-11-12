/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  FileText,
  History,
  LayoutDashboard,
  Mail,
  Send,
  Settings,
  Upload,
  Users,
} from 'lucide-react';
import {
  ActivityLogItem,
  AppSettings,
  BatchQueueState,
  BrandGroup,
  CandidateContact,
  Contact,
  EmailTemplate,
  HistoryEntry,
  ImportAnalysisResult,
  NavigationTab,
} from './types/mailpilot';
import {
  INITIAL_BATCH_STATE,
  INITIAL_STATE,
  loadAppState,
  PersistentAppState,
  saveAppState,
} from './services/storage';
import {
  extractEmailsFromCell,
  generateSampleWorkbookAnalysis,
  parseUploadedSpreadsheet,
} from './utils/excelParser';
import {
  buildBrandGroups,
  getPreferredRecipientForBrand,
  getQueueBrandGroups,
} from './utils/brandQueue';
import { DashboardView } from './components/DashboardView';
import { ContactListView } from './components/ContactListView';
import { BatchWorkspaceView } from './components/BatchWorkspaceView';
import { TemplatesView } from './components/TemplatesView';
import { HistoryView } from './components/HistoryView';
import { SettingsView } from './components/SettingsView';
import { ImportModal } from './components/ImportModal';

export default function App() {
  const [appState, setAppState] = useState<PersistentAppState>(INITIAL_STATE);
  const [isLoaded, setIsLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<NavigationTab>('dashboard');
  const [contactsFilter, setContactsFilter] = useState<string>('all');

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [preloadedAnalysis, setPreloadedAnalysis] =
    useState<ImportAnalysisResult | null>(null);
  const [bannerMessage, setBannerMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Load persisted IndexedDB / localStorage state on mount
  useEffect(() => {
    let mounted = true;
    loadAppState()
      .then((loaded) => {
        if (!mounted) return;
        setAppState(loaded);
        setIsLoaded(true);
      })
      .catch(() => {
        if (!mounted) return;
        setIsLoaded(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Sync dark mode class on <html>
  useEffect(() => {
    const rootEl = document.documentElement;
    if (appState.settings.theme === 'dark') {
      rootEl.classList.add('dark');
    } else {
      rootEl.classList.remove('dark');
    }
  }, [appState.settings.theme]);

  // Save state whenever it changes after initial load
  useEffect(() => {
    if (!isLoaded) return;
    saveAppState(appState);
  }, [appState, isLoaded]);

  const showNotice = (type: 'success' | 'error', text: string) => {
    setBannerMessage({ type, text });
    setTimeout(() => {
      setBannerMessage((prev) => (prev?.text === text ? null : prev));
    }, 4000);
  };

  const appendActivity = (
    type: ActivityLogItem['type'],
    title: string,
    detail: string,
    existingLog: ActivityLogItem[]
  ): ActivityLogItem[] => {
    const entry: ActivityLogItem = {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type,
      title,
      detail,
      timestamp: new Date().toISOString(),
    };
    return [entry, ...existingLog].slice(0, 50);
  };

  const handleConfirmImport = (
    candidates: CandidateContact[],
    fileName: string,
    sheetName: string,
    mode: 'append' | 'replace'
  ) => {
    const nowIso = new Date().toISOString();
    const stamp = Date.now();

    // Map each candidate's brandTempId to a persistent brandId
    const brandIdMap = new Map<string, string>();
    candidates.forEach((c, idx) => {
      if (!brandIdMap.has(c.brandTempId)) {
        brandIdMap.set(c.brandTempId, `brand_${stamp}_${idx}`);
      }
    });

    const newContacts: Contact[] = candidates.map((c, idx) => ({
      id: `cnt_${stamp}_${idx}`,
      brandId: brandIdMap.get(c.brandTempId) || `brand_${stamp}_${idx}`,
      brandName: c.brandName.trim(),
      email: c.email.trim(),
      recipientIndex: c.recipientIndex,
      totalBrandRecipients: c.totalBrandRecipients,
      status: c.status,
      excluded: c.excluded,
      validationFlags: c.validationFlags,
      importedAt: nowIso,
      sourceFile: fileName,
      sheetName,
      phone: c.phone,
      websiteNotes: c.websiteNotes,
      sourceList: c.sourceList,
      rawRowData: c.rawRowData,
    }));

    setAppState((prev) => {
      const rawMerged =
        mode === 'replace' ? newContacts : [...prev.contacts, ...newContacts];
      const brandGroups = buildBrandGroups(rawMerged);
      const flattened = brandGroups.flatMap((bg) => bg.recipients);
      const queueBrands = getQueueBrandGroups(flattened);

      const firstBrand = queueBrands[0] || null;
      const firstRec = firstBrand
        ? getPreferredRecipientForBrand(firstBrand)
        : null;

      const shouldResetPointer =
        mode === 'replace' ||
        !prev.batchState.currentBrandId ||
        !queueBrands.some((b) => b.brandId === prev.batchState.currentBrandId);

      const importedBrandCount = brandIdMap.size;
      const validIncludedCount = newContacts.filter((c) => !c.excluded).length;

      return {
        ...prev,
        contacts: flattened,
        batchState: {
          ...prev.batchState,
          currentIndex: 0,
          currentBrandId: shouldResetPointer
            ? firstBrand?.brandId || null
            : prev.batchState.currentBrandId,
          currentRecipientId: shouldResetPointer
            ? firstRec?.id || null
            : prev.batchState.currentRecipientId,
          acknowledgedBrandIds:
            mode === 'replace' ? [] : prev.batchState.acknowledgedBrandIds,
          batchBrandLimit: null,
          batchBrandOffset: 0,
          isActive: validIncludedCount > 0,
          lastUpdated: nowIso,
        },
        activityLog: appendActivity(
          'import',
          `Imported ${importedBrandCount} brands (${newContacts.length} emails) from ${fileName}`,
          `${validIncludedCount} valid emails queued (${
            mode === 'replace' ? 'Replaced list' : 'Appended to list'
          })`,
          prev.activityLog
        ),
      };
    });

    setPreloadedAnalysis(null);
    showNotice(
      'success',
      `Imported ${brandIdMap.size} brands (${newContacts.length} emails) from "${fileName}".`
    );
  };

  const handleQuickFileUpload = async (file: File) => {
    try {
      const result = await parseUploadedSpreadsheet(file);
      setPreloadedAnalysis(result);
      setIsImportModalOpen(true);
    } catch (err) {
      showNotice(
        'error',
        err instanceof Error
          ? err.message
          : 'Unable to parse spreadsheet. Please upload a valid .xlsx, .xls, or .csv file.'
      );
    }
  };

  const handleLoadSampleDataset = () => {
    const sampleAnalysis = generateSampleWorkbookAnalysis();
    setPreloadedAnalysis(sampleAnalysis);
    setIsImportModalOpen(true);
  };

  const handleUpdateContact = (
    contactId: string,
    updates: Partial<Contact>
  ) => {
    setAppState((prev) => {
      const target = prev.contacts.find((c) => c.id === contactId);
      const updated = prev.contacts.map((c) => {
        if (c.id === contactId) {
          return { ...c, ...updates };
        }
        // If brandName was edited, keep all recipients in the same brand group in sync
        if (
          target &&
          updates.brandName !== undefined &&
          c.brandId === target.brandId
        ) {
          return {
            ...c,
            brandName: updates.brandName,
            validationFlags: {
              ...c.validationFlags,
              missingBrand: updates.brandName.trim().length === 0,
            },
          };
        }
        return c;
      });

      return {
        ...prev,
        contacts: updated,
      };
    });
  };

  const handleDeleteContact = (contactId: string) => {
    setAppState((prev) => {
      const remaining = prev.contacts.filter((c) => c.id !== contactId);
      const brandGroups = buildBrandGroups(remaining);
      const flattened = brandGroups.flatMap((bg) => bg.recipients);
      return {
        ...prev,
        contacts: flattened,
      };
    });
  };

  const handleDeleteBrandGroup = (brandId: string) => {
    setAppState((prev) => {
      const remaining = prev.contacts.filter((c) => c.brandId !== brandId);
      return {
        ...prev,
        contacts: remaining,
      };
    });
  };

  const handleAddManualContact = (brandName: string, emailCell: string) => {
    const extraction = extractEmailsFromCell(emailCell);
    const nowIso = new Date().toISOString();
    const stamp = Date.now();
    const brandId = `brand_manual_${stamp}`;
    const missingBrand = brandName.trim().length === 0;

    const newContacts: Contact[] = extraction.entries.map((entry, idx) => ({
      id: `cnt_${stamp}_${idx}`,
      brandId,
      brandName: brandName.trim(),
      email: entry.email,
      recipientIndex: idx + 1,
      totalBrandRecipients: extraction.entries.length,
      status: entry.isValid ? 'Pending' : 'Invalid',
      excluded: !entry.isValid,
      validationFlags: {
        missingBrand,
        invalidEmail: !entry.isValid,
        duplicateEmail: false,
        duplicateBrand: false,
      },
      importedAt: nowIso,
      sourceFile: 'Manual Entry',
    }));

    setAppState((prev) => {
      const combined = [...newContacts, ...prev.contacts];
      const queueBrands = getQueueBrandGroups(combined);
      const firstBrand = queueBrands[0] || null;
      const firstRec = firstBrand
        ? getPreferredRecipientForBrand(firstBrand)
        : null;

      return {
        ...prev,
        contacts: combined,
        batchState: {
          ...prev.batchState,
          currentBrandId:
            prev.batchState.currentBrandId || firstBrand?.brandId || null,
          currentRecipientId:
            prev.batchState.currentRecipientId || firstRec?.id || null,
        },
        activityLog: appendActivity(
          'import',
          `Added brand: ${brandName || 'Unnamed'} (${newContacts.length} ${
            newContacts.length === 1 ? 'email' : 'emails'
          })`,
          newContacts.map((c) => c.email).join('; '),
          prev.activityLog
        ),
      };
    });
  };

  const handleOpenContactInBatch = (contactId: string, brandId?: string) => {
    const targetContact = appState.contacts.find((c) => c.id === contactId);
    const resolvedBrandId = brandId || targetContact?.brandId || null;

    if (resolvedBrandId) {
      setAppState((prev) => ({
        ...prev,
        batchState: {
          ...prev.batchState,
          currentBrandId: resolvedBrandId,
          currentRecipientId: contactId,
          isPaused: false,
          lastUpdated: new Date().toISOString(),
        },
      }));
    }
    setActiveTab('batch');
  };

  const handleUpdateBatchState = (updates: Partial<BatchQueueState>) => {
    setAppState((prev) => ({
      ...prev,
      batchState: {
        ...prev.batchState,
        ...updates,
      },
    }));
  };

  /**
   * Core Brand-by-Brand Sequential Progression Engine (Sections 4, 5, 6)
   */
  const handleMarkContactStatus = (
    contact: Contact,
    status: 'Prepared' | 'Marked as Sent' | 'Skipped',
    subjectUsed: string
  ) => {
    const nowIso = new Date().toISOString();

    let completedBrandNameNotice: string | null = null;

    setAppState((prev) => {
      const updatedContacts = prev.contacts.map((c) =>
        c.id === contact.id ? { ...c, status, lastProcessedAt: nowIso } : c
      );

      const allQueueBrands = getQueueBrandGroups(updatedContacts);
      const activeQueueBrands = prev.batchState.batchBrandLimit
        ? allQueueBrands.slice(
            prev.batchState.batchBrandOffset || 0,
            (prev.batchState.batchBrandOffset || 0) +
              prev.batchState.batchBrandLimit
          )
        : allQueueBrands;

      const currentBrandIdx = activeQueueBrands.findIndex(
        (b) => b.brandId === contact.brandId
      );
      const currentBrand =
        currentBrandIdx !== -1
          ? activeQueueBrands[currentBrandIdx]
          : allQueueBrands.find((b) => b.brandId === contact.brandId) || null;

      let nextBrandId = prev.batchState.currentBrandId || contact.brandId;
      let nextRecipientId: string | null = contact.id;

      if (status === 'Prepared') {
        // Opening email app NEVER marks email as sent or advances to next recipient
        nextBrandId = contact.brandId;
        nextRecipientId = contact.id;
      } else if (currentBrand) {
        const currentRecIdx = currentBrand.recipients.findIndex(
          (r) => r.id === contact.id
        );

        // Find next pending or prepared valid recipient WITHIN the current brand
        const remainingInBrandAfterCurrent = currentBrand.recipients
          .slice(currentRecIdx + 1)
          .find(
            (r) =>
              !r.excluded &&
              (r.status === 'Pending' || r.status === 'Prepared') &&
              !r.validationFlags.invalidEmail
          );

        const remainingInBrandBeforeCurrent = currentBrand.recipients
          .slice(0, Math.max(0, currentRecIdx))
          .find(
            (r) =>
              !r.excluded &&
              (r.status === 'Pending' || r.status === 'Prepared') &&
              !r.validationFlags.invalidEmail
          );

        const nextPendingInSameBrand =
          remainingInBrandAfterCurrent || remainingInBrandBeforeCurrent || null;

        if (nextPendingInSameBrand) {
          // Rule: Never move to the next brand while the current brand still has pending valid recipients
          nextBrandId = currentBrand.brandId;
          nextRecipientId = nextPendingInSameBrand.id;
        } else {
          // No pending valid recipients remain in currentBrand
          if (currentBrand.emailsSkipped > 0 || status === 'Skipped') {
            // Rule (Section 6): If a recipient is skipped, keep the brand marked as NEEDS ATTENTION.
            // Do not automatically move to the next brand while unresolved recipients remain.
            nextBrandId = currentBrand.brandId;
            nextRecipientId = contact.id;
          } else if (currentBrand.status === 'Completed') {
            // Rule (Section 4 & 5): Only after all valid recipients have been marked as SENT,
            // mark brand as COMPLETED and automatically move to the next brand.
            completedBrandNameNotice = currentBrand.brandName;

            const nextBrandInQueue =
              activeQueueBrands
                .slice(currentBrandIdx + 1)
                .find((b) => b.emailsRemaining > 0) ||
              activeQueueBrands[currentBrandIdx + 1] ||
              null;

            if (nextBrandInQueue) {
              nextBrandId = nextBrandInQueue.brandId;
              const pref = getPreferredRecipientForBrand(nextBrandInQueue);
              nextRecipientId = pref?.id || null;
            } else {
              nextBrandId = currentBrand.brandId;
              nextRecipientId = contact.id;
            }
          }
        }
      }

      const newHistoryEntry: HistoryEntry = {
        id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        contactId: contact.id,
        brandId: contact.brandId,
        brandName: contact.brandName || 'Unnamed Brand',
        email: contact.email,
        subject: subjectUsed,
        timestamp: nowIso,
        status,
        emailApp: prev.batchState.selectedEmailApp,
      };

      const preparedSet = new Set(prev.batchState.preparedContactIds);
      if (status === 'Prepared') {
        preparedSet.add(contact.id);
      }

      const activityTitle =
        status === 'Marked as Sent'
          ? completedBrandNameNotice
            ? `${completedBrandNameNotice} ✓ COMPLETED`
            : `Sent to ${contact.brandName} (${contact.recipientIndex || 1}/${
                contact.totalBrandRecipients || 1
              })`
          : status === 'Skipped'
          ? `Skipped recipient for ${contact.brandName}`
          : `Prepared email for ${contact.brandName}`;

      return {
        ...prev,
        contacts: updatedContacts,
        history: [newHistoryEntry, ...prev.history],
        batchState: {
          ...prev.batchState,
          currentBrandId: nextBrandId,
          currentRecipientId: nextRecipientId,
          lastProcessedContactId: contact.id,
          preparedContactIds: Array.from(preparedSet),
          lastUpdated: nowIso,
        },
        activityLog: appendActivity(
          status === 'Marked as Sent'
            ? 'sent'
            : status === 'Skipped'
            ? 'skipped'
            : 'prepared',
          activityTitle,
          `${contact.email} · ${subjectUsed}`,
          prev.activityLog
        ),
      };
    });

    if (completedBrandNameNotice) {
      showNotice(
        'success',
        `${completedBrandNameNotice} ✓ COMPLETED — Moving to next brand.`
      );
    }
  };

  /**
   * Explicitly skips all remaining pending recipients in a brand and moves to the next brand.
   */
  const handleSkipRemainingInBrand = (
    brand: BrandGroup,
    subjectUsed: string
  ) => {
    const nowIso = new Date().toISOString();

    setAppState((prev) => {
      const pendingIds = new Set(
        brand.recipients
          .filter(
            (r) =>
              !r.excluded &&
              (r.status === 'Pending' || r.status === 'Prepared') &&
              !r.validationFlags.invalidEmail
          )
          .map((r) => r.id)
      );

      const updatedContacts = prev.contacts.map((c) =>
        pendingIds.has(c.id)
          ? { ...c, status: 'Skipped' as const, lastProcessedAt: nowIso }
          : c
      );

      const newHistoryEntries: HistoryEntry[] = brand.recipients
        .filter((r) => pendingIds.has(r.id))
        .map((r, idx) => ({
          id: `hist_${Date.now()}_${idx}_${Math.random()
            .toString(36)
            .slice(2, 5)}`,
          contactId: r.id,
          brandId: brand.brandId,
          brandName: brand.brandName,
          email: r.email,
          subject: subjectUsed,
          timestamp: nowIso,
          status: 'Skipped' as const,
          emailApp: prev.batchState.selectedEmailApp,
        }));

      const allQueueBrands = getQueueBrandGroups(updatedContacts);
      const currentBrandIdx = allQueueBrands.findIndex(
        (b) => b.brandId === brand.brandId
      );
      const nextBrand =
        allQueueBrands
          .slice(currentBrandIdx + 1)
          .find((b) => b.emailsRemaining > 0) ||
        allQueueBrands[currentBrandIdx + 1] ||
        allQueueBrands[currentBrandIdx];

      const nextRec = nextBrand ? getPreferredRecipientForBrand(nextBrand) : null;
      const ackSet = new Set(prev.batchState.acknowledgedBrandIds);
      ackSet.add(brand.brandId);

      return {
        ...prev,
        contacts: updatedContacts,
        history: [...newHistoryEntries, ...prev.history],
        batchState: {
          ...prev.batchState,
          currentBrandId: nextBrand?.brandId || brand.brandId,
          currentRecipientId: nextRec?.id || null,
          acknowledgedBrandIds: Array.from(ackSet),
          lastUpdated: nowIso,
        },
        activityLog: appendActivity(
          'skipped',
          `Skipped ${pendingIds.size} remaining recipients in ${brand.brandName}`,
          `Status: Needs Attention`,
          prev.activityLog
        ),
      };
    });
  };

  /**
   * Explicitly confirms leaving a brand in Needs Attention (with skipped recipients) and advances to the next brand.
   */
  const handleConfirmAdvanceFromNeedsAttentionBrand = (brandId: string) => {
    const nowIso = new Date().toISOString();

    setAppState((prev) => {
      const allQueueBrands = getQueueBrandGroups(prev.contacts);
      const currentBrandIdx = allQueueBrands.findIndex(
        (b) => b.brandId === brandId
      );
      const nextBrand =
        allQueueBrands
          .slice(currentBrandIdx + 1)
          .find((b) => b.emailsRemaining > 0) ||
        allQueueBrands[currentBrandIdx + 1] ||
        allQueueBrands[currentBrandIdx];

      const nextRec = nextBrand ? getPreferredRecipientForBrand(nextBrand) : null;
      const ackSet = new Set(prev.batchState.acknowledgedBrandIds);
      ackSet.add(brandId);

      return {
        ...prev,
        batchState: {
          ...prev.batchState,
          currentBrandId: nextBrand?.brandId || brandId,
          currentRecipientId: nextRec?.id || null,
          acknowledgedBrandIds: Array.from(ackSet),
          lastUpdated: nowIso,
        },
      };
    });
  };

  const handleSaveTemplate = (template: EmailTemplate) => {
    setAppState((prev) => {
      const exists = prev.templates.some((t) => t.id === template.id);
      const updatedTemplates = exists
        ? prev.templates.map((t) => (t.id === template.id ? template : t))
        : [...prev.templates, template];

      return {
        ...prev,
        templates: updatedTemplates,
        activityLog: appendActivity(
          'template',
          `${exists ? 'Updated' : 'Created'} template "${template.name}"`,
          `Subject: ${template.subject}`,
          prev.activityLog
        ),
      };
    });
  };

  const handleDeleteTemplate = (templateId: string) => {
    setAppState((prev) => {
      const remaining = prev.templates.filter((t) => t.id !== templateId);
      if (remaining.length > 0 && !remaining.some((t) => t.isDefault)) {
        remaining[0] = { ...remaining[0], isDefault: true };
      }
      const nextDefaultId =
        remaining.find((t) => t.isDefault)?.id || remaining[0]?.id || '';
      return {
        ...prev,
        templates: remaining,
        settings: {
          ...prev.settings,
          defaultTemplateId:
            prev.settings.defaultTemplateId === templateId
              ? nextDefaultId
              : prev.settings.defaultTemplateId,
        },
        batchState: {
          ...prev.batchState,
          selectedTemplateId:
            prev.batchState.selectedTemplateId === templateId
              ? nextDefaultId
              : prev.batchState.selectedTemplateId,
        },
      };
    });
  };

  const handleSetDefaultTemplate = (templateId: string) => {
    setAppState((prev) => ({
      ...prev,
      templates: prev.templates.map((t) => ({
        ...t,
        isDefault: t.id === templateId,
      })),
      settings: {
        ...prev.settings,
        defaultTemplateId: templateId,
      },
      batchState: {
        ...prev.batchState,
        selectedTemplateId: templateId,
      },
    }));
  };

  const handleUpdateSettings = (updates: Partial<AppSettings>) => {
    setAppState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        ...updates,
      },
      batchState: {
        ...prev.batchState,
        selectedEmailApp:
          updates.defaultEmailApp || prev.batchState.selectedEmailApp,
        selectedTemplateId:
          updates.defaultTemplateId || prev.batchState.selectedTemplateId,
      },
    }));
  };

  const handleClearAllContactData = () => {
    setAppState((prev) => ({
      ...prev,
      contacts: [],
      history: [],
      batchState: {
        ...INITIAL_BATCH_STATE,
        selectedEmailApp: prev.settings.defaultEmailApp,
        selectedTemplateId: prev.settings.defaultTemplateId,
      },
      activityLog: appendActivity(
        'system',
        'Cleared all imported contacts and sending history',
        'Saved templates and preferences were preserved.',
        prev.activityLog
      ),
    }));
  };

  const navItems: {
    id: NavigationTab;
    label: string;
    icon: React.FC<{ className?: string }>;
  }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'contacts', label: 'Contact List', icon: Users },
    { id: 'batch', label: 'Batch Workspace', icon: Send },
    { id: 'templates', label: 'Email Templates', icon: FileText },
    { id: 'history', label: 'Sending History', icon: History },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const brandGroups = useMemo(
    () => buildBrandGroups(appState.contacts),
    [appState.contacts]
  );
  const queueBrands = useMemo(
    () => getQueueBrandGroups(appState.contacts),
    [appState.contacts]
  );
  const completedBrandsCount = useMemo(
    () => brandGroups.filter((b) => b.status === 'Completed').length,
    [brandGroups]
  );

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Desktop Sidebar Navigation */}
      <aside className="hidden w-64 shrink-0 flex-col justify-between border-r border-slate-200 bg-white p-5 lg:flex dark:border-slate-800 dark:bg-slate-900">
        <div className="space-y-6">
          {/* Brand Lockup */}
          <div className="flex items-center gap-2.5 px-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
              <Mail className="h-4 w-4" />
            </div>
            <span className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap dark:text-white">
              MailPilot
            </span>
          </div>

          {/* Primary Navigation */}
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-blue-50 text-blue-600 font-semibold dark:bg-blue-950/60 dark:text-blue-400'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-100'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </span>
                  {item.id === 'contacts' && brandGroups.length > 0 && (
                    <span className="font-mono text-[11px] tabular-nums text-slate-400">
                      {brandGroups.length}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Quiet Sidebar Footer Summary */}
        <div className="border-t border-slate-200 pt-4 px-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <div className="flex items-center justify-between">
            <span>Brands Queued</span>
            <span className="font-mono font-medium text-slate-800 tabular-nums dark:text-slate-200">
              {queueBrands.length}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span>Brands Completed</span>
            <span className="font-mono font-medium text-emerald-600 tabular-nums dark:text-emerald-400">
              {completedBrandsCount}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span>Emails Sent</span>
            <span className="font-mono font-medium text-emerald-600 tabular-nums dark:text-emerald-400">
              {
                appState.contacts.filter((c) => c.status === 'Marked as Sent')
                  .length
              }
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar Contract: 3 zones separated by gap-8 */}
        <header className="flex items-center justify-between gap-8 border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
          {/* Zone 1: Single text element wordmark / breadcrumb */}
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 dark:text-white"
          >
            MailPilot
          </button>

          {/* Zone 2: Concise single-line navigation links */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-600 dark:text-slate-400">
            <button
              type="button"
              onClick={() => setActiveTab('dashboard')}
              className={`transition-colors hover:text-slate-900 whitespace-nowrap shrink-0 dark:hover:text-white ${
                activeTab === 'dashboard'
                  ? 'text-blue-600 underline underline-offset-4 dark:text-blue-400'
                  : ''
              }`}
            >
              Dashboard
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('contacts')}
              className={`transition-colors hover:text-slate-900 whitespace-nowrap shrink-0 dark:hover:text-white ${
                activeTab === 'contacts'
                  ? 'text-blue-600 underline underline-offset-4 dark:text-blue-400'
                  : ''
              }`}
            >
              Contact List
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('templates')}
              className={`transition-colors hover:text-slate-900 whitespace-nowrap shrink-0 dark:hover:text-white ${
                activeTab === 'templates'
                  ? 'text-blue-600 underline underline-offset-4 dark:text-blue-400'
                  : ''
              }`}
            >
              Email Templates
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`transition-colors hover:text-slate-900 whitespace-nowrap shrink-0 dark:hover:text-white ${
                activeTab === 'history'
                  ? 'text-blue-600 underline underline-offset-4 dark:text-blue-400'
                  : ''
              }`}
            >
              Sending History
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`transition-colors hover:text-slate-900 whitespace-nowrap shrink-0 dark:hover:text-white ${
                activeTab === 'settings'
                  ? 'text-blue-600 underline underline-offset-4 dark:text-blue-400'
                  : ''
              }`}
            >
              Settings
            </button>
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="flex items-center shrink-0">
            {queueBrands.length > 0 && activeTab !== 'batch' ? (
              <button
                type="button"
                onClick={() => setActiveTab('batch')}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 whitespace-nowrap shrink-0"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Start Sending ({queueBrands.length} Brands)</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setPreloadedAnalysis(null);
                  setIsImportModalOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 whitespace-nowrap shrink-0"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Import Contacts</span>
              </button>
            )}
          </div>
        </header>

        {/* Mobile Navigation Strip */}
        <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2 md:hidden dark:border-slate-800 dark:bg-slate-900">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 ${
                activeTab === item.id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Notification Banner */}
        {bannerMessage && (
          <div
            className={`border-b px-6 py-2.5 text-xs font-medium ${
              bannerMessage.type === 'error'
                ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-300'
                : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-300'
            }`}
          >
            {bannerMessage.text}
          </div>
        )}

        {/* Active View Content */}
        <main className="mx-auto w-full max-w-6xl flex-1 p-6">
          {activeTab === 'dashboard' && (
            <DashboardView
              contacts={appState.contacts}
              templates={appState.templates}
              batchState={appState.batchState}
              activityLog={appState.activityLog}
              onOpenImportModal={() => {
                setPreloadedAnalysis(null);
                setIsImportModalOpen(true);
              }}
              onQuickFileUpload={handleQuickFileUpload}
              onLoadSampleDataset={handleLoadSampleDataset}
              onContinueCampaign={() => setActiveTab('batch')}
              onNavigateToContacts={(filter) => {
                setContactsFilter(filter || 'all');
                setActiveTab('contacts');
              }}
              onNavigateToTemplates={() => setActiveTab('templates')}
            />
          )}

          {activeTab === 'contacts' && (
            <ContactListView
              contacts={appState.contacts}
              initialFilter={contactsFilter}
              onOpenImportModal={() => {
                setPreloadedAnalysis(null);
                setIsImportModalOpen(true);
              }}
              onUpdateContact={handleUpdateContact}
              onDeleteContact={handleDeleteContact}
              onDeleteBrandGroup={handleDeleteBrandGroup}
              onAddManualContact={handleAddManualContact}
              onOpenInBatchWorkspace={handleOpenContactInBatch}
            />
          )}

          {activeTab === 'batch' && (
            <BatchWorkspaceView
              contacts={appState.contacts}
              templates={appState.templates}
              batchState={appState.batchState}
              onUpdateBatchState={handleUpdateBatchState}
              onUpdateContact={handleUpdateContact}
              onMarkContactStatus={handleMarkContactStatus}
              onSkipRemainingInBrand={handleSkipRemainingInBrand}
              onConfirmAdvanceFromNeedsAttentionBrand={
                handleConfirmAdvanceFromNeedsAttentionBrand
              }
              onOpenImportModal={() => {
                setPreloadedAnalysis(null);
                setIsImportModalOpen(true);
              }}
            />
          )}

          {activeTab === 'templates' && (
            <TemplatesView
              templates={appState.templates}
              contacts={appState.contacts}
              onSaveTemplate={handleSaveTemplate}
              onDeleteTemplate={handleDeleteTemplate}
              onSetDefaultTemplate={handleSetDefaultTemplate}
            />
          )}

          {activeTab === 'history' && (
            <HistoryView
              history={appState.history}
              contacts={appState.contacts}
              onResumeBrandInBatch={handleOpenContactInBatch}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              settings={appState.settings}
              templates={appState.templates}
              contacts={appState.contacts}
              history={appState.history}
              fullState={appState}
              onUpdateSettings={handleUpdateSettings}
              onClearAllContactData={handleClearAllContactData}
            />
          )}
        </main>
      </div>

      {/* Excel / CSV Import & Column Mapping Modal */}
      <ImportModal
        isOpen={isImportModalOpen}
        onClose={() => {
          setIsImportModalOpen(false);
          setPreloadedAnalysis(null);
        }}
        existingContactsCount={appState.contacts.length}
        onConfirmImport={handleConfirmImport}
        initialAnalysis={preloadedAnalysis}
      />
    </div>
  );
}
