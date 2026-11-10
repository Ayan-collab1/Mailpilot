import React, { useMemo, useState } from 'react';
import {
  Download,
  Search,
} from 'lucide-react';
import { Contact, HistoryEntry } from '../types/mailpilot';
import { exportHistoryToCsv } from '../services/storage';
import { EMAIL_APP_OPTIONS } from '../utils/emailLauncher';

interface HistoryViewProps {
  history: HistoryEntry[];
  contacts: Contact[];
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  history,
  contacts,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Combine logged history entries with any pending/invalid contacts so the user can filter across all 5 statuses:
  // Pending, Prepared, Marked as Sent, Skipped, Invalid
  const combinedRecords = useMemo(() => {
    const records: HistoryEntry[] = [...history];
    const loggedContactIds = new Set(history.map((h) => h.contactId));

    for (const c of contacts) {
      if (!loggedContactIds.has(c.id)) {
        records.push({
          id: `state_${c.id}`,
          contactId: c.id,
          brandName: c.brandName || 'Unnamed Brand',
          email: c.email || '—',
          subject: c.customSubject || 'Queued for Outreach',
          timestamp: c.lastProcessedAt || c.importedAt,
          status: c.status,
          emailApp: 'thunderbird_mailto',
        });
      }
    }

    return records.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [history, contacts]);

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return combinedRecords.filter((item) => {
      if (q) {
        const matchBrand = item.brandName.toLowerCase().includes(q);
        const matchEmail = item.email.toLowerCase().includes(q);
        const matchSubj = item.subject.toLowerCase().includes(q);
        if (!matchBrand && !matchEmail && !matchSubj) return false;
      }
      if (statusFilter !== 'all' && item.status !== statusFilter) {
        return false;
      }
      return true;
    });
  }, [combinedRecords, searchQuery, statusFilter]);

  return (
    <div className="space-y-6">
      {/* Header & CSV Export */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Sending & Processing History
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Log of prepared, manually confirmed sent, skipped, pending, and invalid records. Does not claim provider delivery or read status.
          </p>
        </div>

        <button
          type="button"
          disabled={filteredRecords.length === 0}
          onClick={() => exportHistoryToCsv(filteredRecords)}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-40 whitespace-nowrap shrink-0"
        >
          <Download className="h-3.5 w-3.5" />
          <span>Export History to CSV</span>
        </button>
      </div>

      {/* Filter Bar & Search */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          {[
            { id: 'all', label: 'All Statuses' },
            { id: 'Pending', label: 'Pending' },
            { id: 'Prepared', label: 'Prepared' },
            { id: 'Marked as Sent', label: 'Marked as Sent' },
            { id: 'Skipped', label: 'Skipped' },
            { id: 'Invalid', label: 'Invalid' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                statusFilter === tab.id
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by brand name or email..."
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pr-3 pl-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
      </div>

      {/* History Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {filteredRecords.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
              No processing history records match your selection
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              As you prepare, send, or skip contacts in the Batch Workspace, confirmations appear here automatically.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                  <th className="px-4 py-3 font-medium">Brand Name</th>
                  <th className="px-4 py-3 font-medium">Recipient Email</th>
                  <th className="px-4 py-3 font-medium">Subject</th>
                  <th className="px-4 py-3 font-medium">Date and Time</th>
                  <th className="px-4 py-3 font-medium">Processing Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredRecords.map((entry) => {
                  const appLabel =
                    EMAIL_APP_OPTIONS.find((a) => a.id === entry.emailApp)
                      ?.shortLabel || entry.emailApp;

                  const statusClass =
                    entry.status === 'Marked as Sent'
                      ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                      : entry.status === 'Prepared'
                      ? 'text-blue-600 dark:text-blue-400 font-medium'
                      : entry.status === 'Skipped'
                      ? 'text-amber-600 dark:text-amber-400 font-medium'
                      : entry.status === 'Invalid'
                      ? 'text-red-600 dark:text-red-400 font-medium'
                      : 'text-slate-600 dark:text-slate-300 font-medium';

                  return (
                    <tr
                      key={entry.id}
                      className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                    >
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                        {entry.brandName}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-600 tabular-nums dark:text-slate-300">
                        {entry.email}
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                        {entry.subject}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-500 tabular-nums dark:text-slate-400">
                        {new Date(entry.timestamp).toLocaleString([], {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className={statusClass}>{entry.status}</span>
                          {(entry.status === 'Prepared' ||
                            entry.status === 'Marked as Sent') && (
                            <>
                              <span aria-hidden="true" className="text-slate-400">
                                ·
                              </span>
                              <span className="text-slate-500 dark:text-slate-400">
                                {appLabel}
                              </span>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
