import React, { useState } from 'react';
import {
  Download,
  Moon,
  ShieldCheck,
  Sun,
  Trash2,
} from 'lucide-react';
import {
  AppSettings,
  Contact,
  EmailAppType,
  EmailTemplate,
  HistoryEntry,
} from '../types/mailpilot';
import {
  exportContactsAndProgressToCsv,
  exportFullBackupJson,
  exportHistoryToCsv,
  PersistentAppState,
} from '../services/storage';
import { EMAIL_APP_OPTIONS } from '../utils/emailLauncher';

interface SettingsViewProps {
  settings: AppSettings;
  templates: EmailTemplate[];
  contacts: Contact[];
  history: HistoryEntry[];
  fullState: PersistentAppState;
  onUpdateSettings: (updates: Partial<AppSettings>) => void;
  onClearAllContactData: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  templates,
  contacts,
  history,
  fullState,
  onUpdateSettings,
  onClearAllContactData,
}) => {
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearedNotice, setClearedNotice] = useState(false);

  const handleConfirmClearData = () => {
    onClearAllContactData();
    setConfirmClear(false);
    setClearedNotice(true);
    setTimeout(() => setClearedNotice(false), 3000);
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Application Settings & Data Management
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Configure your default email application, default outreach template, appearance, and local storage backups.
        </p>
      </div>

      {/* Preferences Card */}
      <div className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Outreach & Interface Preferences
        </h3>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Default Email Application
            </label>
            <select
              value={settings.defaultEmailApp}
              onChange={(e) =>
                onUpdateSettings({
                  defaultEmailApp: e.target.value as EmailAppType,
                })
              }
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {EMAIL_APP_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Used when starting new outreach batches in the Batch Workspace.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Default Email Template
            </label>
            <select
              value={settings.defaultTemplateId}
              onChange={(e) =>
                onUpdateSettings({
                  defaultTemplateId: e.target.value,
                })
              }
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Automatically selected for new batch sessions.
            </p>
          </div>
        </div>

        {/* Theme Switcher */}
        <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-medium text-slate-900 dark:text-slate-100">
                Interface Theme
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Switch between clean Light mode and high-contrast Dark mode.
              </p>
            </div>

            <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => onUpdateSettings({ theme: 'light' })}
                className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  settings.theme === 'light'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                }`}
              >
                <Sun className="h-3.5 w-3.5" />
                <span>Light</span>
              </button>
              <button
                type="button"
                onClick={() => onUpdateSettings({ theme: 'dark' })}
                className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  settings.theme === 'dark'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                }`}
              >
                <Moon className="h-3.5 w-3.5" />
                <span>Dark</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Export & Clear Data Card */}
      <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Export & Local Data Management
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Export your imported contacts, campaign progress, or sending history at any time.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={contacts.length === 0}
            onClick={() => exportContactsAndProgressToCsv(contacts)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export Contacts & Progress (.csv)</span>
          </button>

          <button
            type="button"
            disabled={history.length === 0}
            onClick={() => exportHistoryToCsv(history)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export Sending History (.csv)</span>
          </button>

          <button
            type="button"
            onClick={() => exportFullBackupJson(fullState)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export Full Workspace Backup (.json)</span>
          </button>
        </div>

        <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
          {!confirmClear ? (
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <p className="text-xs font-medium text-slate-900 dark:text-slate-100">
                  Clear All Contact Data
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Removes all imported contacts, queue progress, and sending history while preserving your saved email templates.
                </p>
              </div>
              <button
                type="button"
                disabled={contacts.length === 0 && history.length === 0}
                onClick={() => setConfirmClear(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50/60 px-4 py-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:opacity-40 whitespace-nowrap shrink-0 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Clear All Contact Data</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col justify-between gap-3 rounded-lg border border-red-200 bg-red-50/70 p-4 sm:flex-row sm:items-center dark:border-red-900/60 dark:bg-red-950/40">
              <p className="text-xs font-medium text-red-800 dark:text-red-200">
                Are you sure you want to permanently clear {contacts.length} contacts and {history.length} history logs from browser storage?
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmClearData}
                  className="rounded-lg bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                >
                  Confirm Clear Data
                </button>
              </div>
            </div>
          )}

          {clearedNotice && (
            <p className="mt-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              All contact data and sending history have been cleared.
            </p>
          )}
        </div>
      </div>

      {/* Application Information & Privacy */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
          <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Application Information & Local Privacy Guarantee
            </h3>
            <p>
              <strong className="font-semibold text-slate-900 dark:text-slate-200">
                MailPilot — Personal Email Outreach Assistant
              </strong>{' '}
              is a personal email preparation and sequential batch assistant.
            </p>
            <p>
              All Excel (.xlsx, .xls) and CSV parsing, column detection, contact validation, template personalization, and queue tracking run 100% locally in your browser using IndexedDB and localStorage. Uploaded spreadsheets are never transmitted to external servers, and no email account passwords or OAuth tokens are requested.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
