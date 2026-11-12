import React, { useMemo, useState } from 'react';
import {
  Download,
  Play,
  Search,
} from 'lucide-react';
import { Contact, HistoryEntry } from '../types/mailpilot';
import { exportHistoryToCsv } from '../services/storage';
import { EMAIL_APP_OPTIONS } from '../utils/emailLauncher';
import {
  buildBrandGroups,
  formatRecipientStatusLabel,
  getPreferredRecipientForBrand,
} from '../utils/brandQueue';

interface HistoryViewProps {
  history: HistoryEntry[];
  contacts: Contact[];
  onResumeBrandInBatch?: (contactId: string, brandId: string) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  history,
  contacts,
  onResumeBrandInBatch,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'brands' | 'recipients'>('brands');

  const brandGroups = useMemo(() => {
    return buildBrandGroups(contacts);
  }, [contacts]);

  const combinedRecords = useMemo(() => {
    const records: HistoryEntry[] = [...history];
    const loggedContactIds = new Set(history.map((h) => h.contactId));

    for (const c of contacts) {
      if (!loggedContactIds.has(c.id)) {
        records.push({
          id: `state_${c.id}`,
          contactId: c.id,
          brandId: c.brandId,
          brandName: c.brandName || 'Unnamed Brand',
          email: c.email || '—',
          subject: c.customSubject || 'Queued',
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

  const filteredBrands = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return brandGroups.filter((b) => {
      if (q) {
        const matchBrand = b.brandName.toLowerCase().includes(q);
        const matchEmail = b.recipients.some((r) =>
          r.email.toLowerCase().includes(q)
        );
        if (!matchBrand && !matchEmail) return false;
      }
      if (statusFilter === 'all') return true;
      if (statusFilter === 'Completed') return b.status === 'Completed';
      if (statusFilter === 'Needs Attention')
        return b.status === 'Needs Attention';
      if (statusFilter === 'In Progress') return b.status === 'In Progress';
      if (statusFilter === 'Pending') return b.status === 'Pending';
      if (statusFilter === 'Invalid')
        return b.status === 'Invalid' || b.invalidEmailCount > 0;
      return true;
    });
  }, [brandGroups, searchQuery, statusFilter]);

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return combinedRecords.filter((item) => {
      if (q) {
        const matchBrand = item.brandName.toLowerCase().includes(q);
        const matchEmail = item.email.toLowerCase().includes(q);
        const matchSubj = item.subject.toLowerCase().includes(q);
        if (!matchBrand && !matchEmail && !matchSubj) return false;
      }
      if (statusFilter === 'all') return true;
      if (statusFilter === 'Completed')
        return item.status === 'Marked as Sent';
      if (statusFilter === 'Needs Attention') return item.status === 'Skipped';
      if (statusFilter === 'In Progress') return item.status === 'Prepared';
      if (statusFilter === 'Pending') return item.status === 'Pending';
      if (statusFilter === 'Invalid') return item.status === 'Invalid';
      return item.status === statusFilter;
    });
  }, [combinedRecords, searchQuery, statusFilter]);

  return (
    <div className="space-y-6">
      {/* Header, View Mode Toggle & CSV Export */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Sending History
          </h2>

          <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setViewMode('brands')}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                viewMode === 'brands'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
              }`}
            >
              Brand History ({brandGroups.length})
            </button>
            <button
              type="button"
              onClick={() => setViewMode('recipients')}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                viewMode === 'recipients'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
              }`}
            >
              Recipient Log ({combinedRecords.length})
            </button>
          </div>
        </div>

        <button
          type="button"
          disabled={filteredRecords.length === 0}
          onClick={() => exportHistoryToCsv(filteredRecords)}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-40 whitespace-nowrap shrink-0"
        >
          <Download className="h-3.5 w-3.5" />
          <span>Export CSV</span>
        </button>
      </div>

      {/* Filter Bar & Search */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          {[
            { id: 'all', label: 'All' },
            { id: 'Completed', label: 'Completed' },
            { id: 'Needs Attention', label: 'Needs Attention' },
            { id: 'In Progress', label: 'In Progress' },
            { id: 'Pending', label: 'Pending' },
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

        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search brand or email..."
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pr-3 pl-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
      </div>

      {viewMode === 'brands' ? (
        /* Brand-Level & Recipient-Level History Cards */
        filteredBrands.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              No brand history records
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {filteredBrands.map((brand) => {
              const preferredRec = getPreferredRecipientForBrand(brand);
              const canResume =
                onResumeBrandInBatch &&
                preferredRec &&
                brand.validEmailCount > 0 &&
                brand.status !== 'Completed';

              const statusColor =
                brand.status === 'Completed'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : brand.status === 'Needs Attention'
                  ? 'text-amber-600 dark:text-amber-400'
                  : brand.status === 'In Progress'
                  ? 'text-blue-600 dark:text-blue-400'
                  : brand.status === 'Invalid'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-slate-600 dark:text-slate-400';

              return (
                <div
                  key={brand.brandId}
                  className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {brand.status === 'Completed'
                            ? `${brand.brandName} ✓`
                            : brand.brandName}
                        </h3>
                        <p className="mt-1 font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
                          {brand.totalEmailsFound}{' '}
                          {brand.totalEmailsFound === 1
                            ? 'email found'
                            : 'emails found'}{' '}
                          · {brand.emailsSent} sent
                          {brand.emailsSkipped > 0
                            ? ` · ${brand.emailsSkipped} skipped`
                            : ''}
                          {brand.emailsRemaining > 0
                            ? ` · ${brand.emailsRemaining} pending`
                            : ''}
                          {brand.invalidEmailCount > 0
                            ? ` · ${brand.invalidEmailCount} invalid`
                            : ''}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`text-xs font-semibold ${statusColor}`}
                        >
                          Status: {brand.status}
                        </span>
                        {canResume && (
                          <button
                            type="button"
                            onClick={() =>
                              onResumeBrandInBatch(
                                preferredRec.id,
                                brand.brandId
                              )
                            }
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-800 dark:text-blue-400"
                          >
                            <Play className="h-3 w-3" />
                            <span>Resume</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Individual Recipient Status Breakdown */}
                    <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800/70">
                      {brand.recipients.map((rec, idx) => {
                        const rLabel = formatRecipientStatusLabel(rec.status);
                        const rColor =
                          rec.status === 'Marked as Sent'
                            ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                            : rec.status === 'Skipped'
                            ? 'text-amber-600 dark:text-amber-400 font-medium'
                            : rec.status === 'Invalid'
                            ? 'text-red-600 dark:text-red-400 font-medium'
                            : rec.status === 'Prepared'
                            ? 'text-blue-600 dark:text-blue-400 font-medium'
                            : 'text-slate-500 dark:text-slate-400';

                        return (
                          <div
                            key={rec.id}
                            className="flex items-center justify-between gap-2 py-2 text-xs"
                          >
                            <div className="flex min-w-0 items-center gap-2 font-mono">
                              <span className="text-slate-400 tabular-nums">
                                {idx + 1}.
                              </span>
                              <span className="truncate text-slate-800 dark:text-slate-200">
                                {rec.email || 'Empty'}
                              </span>
                            </div>
                            <span className={`shrink-0 ${rColor}`}>
                              {rLabel}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* Recipient-Level Log Table */
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          {filteredRecords.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                No history records
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
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Status</th>
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
                            <span className={statusClass}>
                              {formatRecipientStatusLabel(entry.status)}
                            </span>
                            {(entry.status === 'Prepared' ||
                              entry.status === 'Marked as Sent') && (
                              <>
                                <span
                                  aria-hidden="true"
                                  className="text-slate-400"
                                >
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
      )}
    </div>
  );
};
