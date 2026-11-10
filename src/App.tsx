/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
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
  generateSampleWorkbookAnalysis,
  isValidEmailAddress,
  parseUploadedSpreadsheet,
} from './utils/excelParser';
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
    loadAppState().then((loaded) => {
      if (!mounted) return;
      setAppState(loaded);
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
    const newContacts: Contact[] = candidates.map((c, idx) => ({
      id: `cnt_${Date.now()}_${idx}`,
      brandName: c.brandName.trim(),
      email: c.email.trim(),
      status: c.status,
      excluded: c.excluded,
      validationFlags: c.validationFlags,
      importedAt: nowIso,
      sourceFile: fileName,
      sheetName,
    }));

    setAppState((prev) => {
      const mergedContacts =
        mode === 'replace' ? newContacts : [...prev.contacts, ...newContacts];
      const validIncludedCount = newContacts.filter((c) => !c.excluded).length;

      return {
        ...prev,
        contacts: mergedContacts,
        batchState: {
          ...prev.batchState,
          currentIndex: mode === 'replace' ? 0 : prev.batchState.currentIndex,
          isActive: validIncludedCount > 0,
          lastUpdated: nowIso,
        },
        activityLog: appendActivity(
          'import',
          `Imported ${newContacts.length} contacts from ${fileName}`,
          `${validIncludedCount} valid contacts queued for outreach (${
            mode === 'replace' ? 'Replaced previous list' : 'Appended to list'
          })`,
          prev.activityLog
        ),
      };
    });

    setPreloadedAnalysis(null);
    showNotice(
      'success',
      `Successfully imported ${newContacts.length} contacts from "${fileName}".`
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

  const handleUpdateContact = (contactId: string, updates: Partial<Contact>) => {
    setAppState((prev) => ({
      ...prev,
      contacts: prev.contacts.map((c) =>
        c.id === contactId ? { ...c, ...updates } : c
      ),
    }));
  };

  const handleDeleteContact = (contactId: string) => {
    setAppState((prev) => ({
      ...prev,
      contacts: prev.contacts.filter((c) => c.id !== contactId),
    }));
  };

  const handleAddManualContact = (brandName: string, email: string) => {
    const valid = isValidEmailAddress(email);
    const nowIso = new Date().toISOString();
    const newContact: Contact = {
      id: `cnt_${Date.now()}`,
      brandName,
      email,
      status: valid ? 'Pending' : 'Invalid',
      excluded: !valid,
      validationFlags: {
        missingBrand: brandName.length === 0,
        invalidEmail: !valid,
        duplicateEmail: prevHasEmail(appState.contacts, email),
        duplicateBrand: prevHasBrand(appState.contacts, brandName),
      },
      importedAt: nowIso,
      sourceFile: 'Manual Entry',
    };

    setAppState((prev) => ({
      ...prev,
      contacts: [newContact, ...prev.contacts],
      activityLog: appendActivity(
        'import',
        `Added contact: ${brandName || email}`,
        `Status: ${newContact.status}`,
        prev.activityLog
      ),
    }));
  };

  const handleOpenContactInBatch = (contactId: string) => {
    const queue = appState.contacts.filter((c) => !c.excluded);
    const targetIdx = queue.findIndex((c) => c.id === contactId);
    if (targetIdx !== -1) {
      setAppState((prev) => ({
        ...prev,
        batchState: {
          ...prev.batchState,
          currentIndex: targetIdx,
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

  const handleMarkContactStatus = (
    contact: Contact,
    status: 'Prepared' | 'Marked as Sent' | 'Skipped',
    subjectUsed: string,
    advanceNext: boolean
  ) => {
    const nowIso = new Date().toISOString();

    setAppState((prev) => {
      const updatedContacts = prev.contacts.map((c) =>
        c.id === contact.id
          ? { ...c, status, lastProcessedAt: nowIso }
          : c
      );

      const queueContacts = updatedContacts.filter((c) => !c.excluded);
      const currentIdxInQueue = queueContacts.findIndex(
        (c) => c.id === contact.id
      );

      const nextIndex =
        advanceNext && currentIdxInQueue !== -1
          ? Math.min(currentIdxInQueue + 1, Math.max(0, queueContacts.length - 1))
          : prev.batchState.currentIndex;

      const newHistoryEntry: HistoryEntry = {
        id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        contactId: contact.id,
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
          ? `Marked email as sent to ${contact.brandName}`
          : status === 'Skipped'
          ? `Skipped contact ${contact.brandName}`
          : `Prepared email for ${contact.brandName}`;

      return {
        ...prev,
        contacts: updatedContacts,
        history: [newHistoryEntry, ...prev.history],
        batchState: {
          ...prev.batchState,
          currentIndex: nextIndex,
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

  const eligibleQueueCount = appState.contacts.filter((c) => !c.excluded).length;

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
                  {item.id === 'contacts' && appState.contacts.length > 0 && (
                    <span className="font-mono text-[11px] tabular-nums text-slate-400">
                      {appState.contacts.length}
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
            <span>Queue Ready</span>
            <span className="font-mono font-medium text-slate-800 tabular-nums dark:text-slate-200">
              {eligibleQueueCount}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span>Marked as Sent</span>
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

          {/* Zone 2: Concise single-line navigation links (visible on mobile/tablet and desktop) */}
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
            {eligibleQueueCount > 0 && activeTab !== 'batch' ? (
              <button
                type="button"
                onClick={() => setActiveTab('batch')}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 whitespace-nowrap shrink-0"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Start Sending ({eligibleQueueCount})</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setPreloadedAnalysis(null);
                  setIsImportModalOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 whitespace-nowrap shrink-0"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Import Contacts</span>
              </button>
            )}
          </div>
        </header>

        {/* Mobile Navigation Strip (visible only on small screens) */}
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

function prevHasEmail(contacts: Contact[], email: string): boolean {
  const clean = email.trim().toLowerCase();
  if (!clean) return false;
  return contacts.some((c) => c.email.trim().toLowerCase() === clean);
}

function prevHasBrand(contacts: Contact[], brand: string): boolean {
  const clean = brand.trim().toLowerCase();
  if (!clean) return false;
  return contacts.some((c) => c.brandName.trim().toLowerCase() === clean);
}
