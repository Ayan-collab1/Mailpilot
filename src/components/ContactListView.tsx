import React, { useMemo, useState } from 'react';
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronRight,
  Edit3,
  Play,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { BrandGroup, Contact, ContactStatus } from '../types/mailpilot';
import { isValidEmailAddress } from '../utils/excelParser';
import {
  buildBrandGroups,
  formatRecipientStatusLabel,
} from '../utils/brandQueue';

interface ContactListViewProps {
  contacts: Contact[];
  initialFilter?: string;
  onOpenImportModal: () => void;
  onUpdateContact: (contactId: string, updates: Partial<Contact>) => void;
  onDeleteContact: (contactId: string) => void;
  onDeleteBrandGroup: (brandId: string) => void;
  onAddManualContact: (brandName: string, emailCell: string) => void;
  onOpenInBatchWorkspace: (contactId: string, brandId?: string) => void;
}

type SortField = 'brandName' | 'emails' | 'status';
type SortOrder = 'asc' | 'desc';

export const ContactListView: React.FC<ContactListViewProps> = ({
  contacts,
  initialFilter = 'all',
  onOpenImportModal,
  onUpdateContact,
  onDeleteContact,
  onDeleteBrandGroup,
  onAddManualContact,
  onOpenInBatchWorkspace,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(initialFilter);
  const [sortField, setSortField] = useState<SortField>('brandName');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [expandedBrands, setExpandedBrands] = useState<Record<string, boolean>>(
    {}
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBrand, setEditBrand] = useState('');
  const [editEmail, setEditEmail] = useState('');

  const [showAddRow, setShowAddRow] = useState(false);
  const [newBrand, setNewBrand] = useState('');
  const [newEmail, setNewEmail] = useState('');

  React.useEffect(() => {
    if (initialFilter) {
      setStatusFilter(initialFilter);
    }
  }, [initialFilter]);

  const brandGroups = useMemo(() => {
    return buildBrandGroups(contacts);
  }, [contacts]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const toggleBrandExpand = (brandId: string) => {
    setExpandedBrands((prev) => ({
      ...prev,
      [brandId]: !prev[brandId],
    }));
  };

  const filteredAndSortedBrands = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = brandGroups.filter((bg) => {
      if (q) {
        const matchBrand = bg.brandName.toLowerCase().includes(q);
        const matchEmail = bg.recipients.some((r) =>
          r.email.toLowerCase().includes(q)
        );
        const matchNotes =
          (bg.websiteNotes || '').toLowerCase().includes(q) ||
          (bg.sourceList || '').toLowerCase().includes(q);
        if (!matchBrand && !matchEmail && !matchNotes) return false;
      }

      if (statusFilter === 'all') return true;
      if (statusFilter === 'Completed') return bg.status === 'Completed';
      if (statusFilter === 'In Progress') return bg.status === 'In Progress';
      if (statusFilter === 'Needs Attention')
        return bg.status === 'Needs Attention';
      if (statusFilter === 'Pending')
        return (
          bg.status === 'Pending' ||
          bg.recipients.some((r) => r.status === 'Pending')
        );
      if (statusFilter === 'Prepared')
        return bg.recipients.some((r) => r.status === 'Prepared');
      if (statusFilter === 'Marked as Sent')
        return (
          bg.status === 'Completed' ||
          bg.recipients.some((r) => r.status === 'Marked as Sent')
        );
      if (statusFilter === 'Skipped')
        return (
          bg.status === 'Needs Attention' ||
          bg.recipients.some((r) => r.status === 'Skipped')
        );
      if (statusFilter === 'Invalid')
        return (
          bg.status === 'Invalid' ||
          bg.recipients.some(
            (r) => r.status === 'Invalid' || r.validationFlags.invalidEmail
          )
        );
      if (statusFilter === 'Excluded') return bg.excluded;
      return true;
    });

    return [...list].sort((a, b) => {
      if (sortField === 'emails') {
        const diff = a.totalEmailsFound - b.totalEmailsFound;
        return sortOrder === 'asc' ? diff : -diff;
      }
      if (sortField === 'status') {
        const valA = a.status.toLowerCase();
        const valB = b.status.toLowerCase();
        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      }
      const valA = (a.brandName || '').toLowerCase();
      const valB = (b.brandName || '').toLowerCase();
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [brandGroups, searchQuery, statusFilter, sortField, sortOrder]);

  const startEditing = (c: Contact) => {
    setEditingId(c.id);
    setEditBrand(c.brandName);
    setEditEmail(c.email);
  };

  const saveEditing = (c: Contact) => {
    const trimmedBrand = editBrand.trim();
    const trimmedEmail = editEmail.trim();
    const valid = isValidEmailAddress(trimmedEmail);
    const nextStatus: ContactStatus = !valid
      ? 'Invalid'
      : c.status === 'Invalid'
      ? 'Pending'
      : c.status;

    onUpdateContact(c.id, {
      brandName: trimmedBrand,
      email: trimmedEmail,
      status: nextStatus,
      excluded: !valid ? true : false,
      validationFlags: {
        ...c.validationFlags,
        missingBrand: trimmedBrand.length === 0,
        invalidEmail: !valid,
      },
    });
    setEditingId(null);
  };

  const handleCreateManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBrand.trim() && !newEmail.trim()) return;
    onAddManualContact(newBrand.trim(), newEmail.trim());
    setNewBrand('');
    setNewEmail('');
    setShowAddRow(false);
  };

  const counts = useMemo(() => {
    return {
      allBrands: brandGroups.length,
      totalEmails: contacts.length,
      pendingBrands: brandGroups.filter(
        (b) => b.status === 'Pending' || b.status === 'In Progress'
      ).length,
      completedBrands: brandGroups.filter((b) => b.status === 'Completed')
        .length,
      needsAttentionBrands: brandGroups.filter(
        (b) => b.status === 'Needs Attention'
      ).length,
      invalidEmails: contacts.filter(
        (c) => c.status === 'Invalid' || c.validationFlags.invalidEmail
      ).length,
    };
  }, [brandGroups, contacts]);

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Contact List
          </h2>
          {brandGroups.length > 0 && (
            <span className="font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
              {counts.allBrands} brands · {counts.totalEmails} emails
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowAddRow((prev) => !prev)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Brand</span>
          </button>
          <button
            type="button"
            onClick={onOpenImportModal}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 whitespace-nowrap shrink-0"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Import Excel / CSV</span>
          </button>
        </div>
      </div>

      {/* Add Brand / Multi-Email Contact Form */}
      {showAddRow && (
        <form
          onSubmit={handleCreateManual}
          className="flex flex-col items-end gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:flex-row dark:border-slate-800 dark:bg-slate-800/40"
        >
          <div className="w-full sm:w-64">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Brand Name
            </label>
            <input
              type="text"
              value={newBrand}
              onChange={(e) => setNewBrand(e.target.value)}
              placeholder="Flipkart"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
          <div className="w-full sm:flex-1">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Email Addresses (Semicolon or comma separated)
            </label>
            <input
              type="text"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="abhishek.kumar@flipkart.com; abhyudya.rathour@flipkart.com"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 whitespace-nowrap shrink-0"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setShowAddRow(false)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Filter Bar & Search */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          {[
            { id: 'all', label: `All Brands (${counts.allBrands})` },
            { id: 'Pending', label: `Active (${counts.pendingBrands})` },
            {
              id: 'Completed',
              label: `Completed (${counts.completedBrands})`,
            },
            {
              id: 'Needs Attention',
              label: `Needs Attention (${counts.needsAttentionBrands})`,
            },
            { id: 'Invalid', label: `Invalid (${counts.invalidEmails})` },
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

      {/* Hierarchical Brand Queue Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {filteredAndSortedBrands.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
              {contacts.length === 0
                ? 'No contacts imported'
                : 'No matching brands'}
            </p>
            {contacts.length === 0 && (
              <button
                type="button"
                onClick={onOpenImportModal}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Upload Excel / CSV</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                  <th className="w-10 px-4 py-3 font-medium"></th>
                  <th className="px-4 py-3 font-medium">
                    <button
                      type="button"
                      onClick={() => handleSort('brandName')}
                      className="inline-flex items-center gap-1 font-medium hover:text-slate-900 dark:hover:text-white"
                    >
                      <span>Brand Name</span>
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-4 py-3 font-medium">
                    <button
                      type="button"
                      onClick={() => handleSort('emails')}
                      className="inline-flex items-center gap-1 font-medium hover:text-slate-900 dark:hover:text-white"
                    >
                      <span>Emails & Progress</span>
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-4 py-3 font-medium">Recipients</th>
                  <th className="px-4 py-3 font-medium">
                    <button
                      type="button"
                      onClick={() => handleSort('status')}
                      className="inline-flex items-center gap-1 font-medium hover:text-slate-900 dark:hover:text-white"
                    >
                      <span>Brand Status</span>
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredAndSortedBrands.map((brand) => {
                  const isExpanded =
                    expandedBrands[brand.brandId] ??
                    (brand.totalEmailsFound > 1 || searchQuery.trim().length > 0);

                  const brandStatusColor =
                    brand.status === 'Completed'
                      ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                      : brand.status === 'Needs Attention'
                      ? 'text-amber-600 dark:text-amber-400 font-semibold'
                      : brand.status === 'In Progress'
                      ? 'text-blue-600 dark:text-blue-400 font-semibold'
                      : brand.status === 'Invalid'
                      ? 'text-red-600 dark:text-red-400 font-semibold'
                      : 'text-slate-700 dark:text-slate-300 font-medium';

                  const preferredRec =
                    brand.recipients.find(
                      (r) =>
                        !r.excluded &&
                        (r.status === 'Pending' || r.status === 'Prepared')
                    ) || brand.recipients[0];

                  return (
                    <React.Fragment key={brand.brandId}>
                      {/* Brand Header Row */}
                      <tr className="bg-white transition-colors hover:bg-slate-50/80 dark:bg-slate-900 dark:hover:bg-slate-800/40">
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => toggleBrandExpand(brand.brandId)}
                            className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
                            aria-label="Toggle recipients"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </td>

                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900 dark:text-slate-100">
                            {brand.status === 'Completed'
                              ? `${brand.brandName} ✓`
                              : brand.brandName || (
                                  <span className="italic text-amber-600">
                                    Missing Brand
                                  </span>
                                )}
                          </div>
                          {(brand.sourceList || brand.websiteNotes) && (
                            <div className="mt-0.5 truncate max-w-60 text-[11px] text-slate-500 dark:text-slate-400">
                              {[brand.sourceList, brand.websiteNotes]
                                .filter(Boolean)
                                .join(' · ')}
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3 font-mono tabular-nums">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-semibold text-slate-900 dark:text-slate-100">
                              {brand.emailsSent}/{brand.validEmailCount} sent
                            </span>
                            <span className="text-slate-400">·</span>
                            <span className="text-slate-600 dark:text-slate-400">
                              {brand.totalEmailsFound} found
                            </span>
                            {brand.emailsRemaining > 0 && (
                              <>
                                <span className="text-slate-400">·</span>
                                <span className="text-blue-600 dark:text-blue-400">
                                  {brand.emailsRemaining} rem
                                </span>
                              </>
                            )}
                            {brand.emailsSkipped > 0 && (
                              <>
                                <span className="text-slate-400">·</span>
                                <span className="text-amber-600 dark:text-amber-400">
                                  {brand.emailsSkipped} skipped
                                </span>
                              </>
                            )}
                            {brand.invalidEmailCount > 0 && (
                              <>
                                <span className="text-slate-400">·</span>
                                <span className="text-red-600 dark:text-red-400">
                                  {brand.invalidEmailCount} invalid
                                </span>
                              </>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-300">
                          <button
                            type="button"
                            onClick={() => toggleBrandExpand(brand.brandId)}
                            className="text-left hover:underline"
                          >
                            {brand.recipients[0]?.email || '—'}
                            {brand.totalEmailsFound > 1 && (
                              <span className="ml-1.5 text-blue-600 dark:text-blue-400">
                                (+{brand.totalEmailsFound - 1} more)
                              </span>
                            )}
                          </button>
                        </td>

                        <td className="px-4 py-3">
                          <span className={brandStatusColor}>
                            {brand.status}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            {preferredRec && (
                              <button
                                type="button"
                                onClick={() =>
                                  onOpenInBatchWorkspace(
                                    preferredRec.id,
                                    brand.brandId
                                  )
                                }
                                disabled={
                                  brand.excluded || brand.validEmailCount === 0
                                }
                                title="Open Brand in Batch Workspace"
                                className="rounded p-1.5 text-slate-500 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-blue-400"
                              >
                                <Play className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onDeleteBrandGroup(brand.brandId)}
                              title="Delete Brand"
                              className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Recipient Rows under Brand */}
                      {isExpanded &&
                        brand.recipients.map((rec, rIdx) => {
                          const isEditing = editingId === rec.id;
                          const recStatusClass =
                            rec.status === 'Marked as Sent'
                              ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                              : rec.status === 'Invalid'
                              ? 'text-red-600 dark:text-red-400 font-medium'
                              : rec.status === 'Skipped'
                              ? 'text-amber-600 dark:text-amber-400 font-medium'
                              : rec.status === 'Prepared'
                              ? 'text-blue-600 dark:text-blue-400 font-medium'
                              : 'text-slate-600 dark:text-slate-400';

                          return (
                            <tr
                              key={rec.id}
                              className={`bg-slate-50/60 dark:bg-slate-800/30 ${
                                rec.excluded ? 'opacity-60' : ''
                              }`}
                            >
                              <td className="px-4 py-2 text-right">
                                <input
                                  type="checkbox"
                                  checked={!rec.excluded}
                                  onChange={() =>
                                    onUpdateContact(rec.id, {
                                      excluded: !rec.excluded,
                                    })
                                  }
                                  className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                />
                              </td>

                              <td className="px-4 py-2 pl-8 text-slate-500 dark:text-slate-400">
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={editBrand}
                                    onChange={(e) =>
                                      setEditBrand(e.target.value)
                                    }
                                    className="w-full rounded border border-blue-500 bg-white px-2 py-1 text-xs text-slate-900 focus:outline-none dark:bg-slate-800 dark:text-slate-100"
                                  />
                                ) : (
                                  <span className="font-mono text-[11px] tabular-nums">
                                    Recipient {rIdx + 1} of{' '}
                                    {brand.totalEmailsFound}
                                  </span>
                                )}
                              </td>

                              <td className="px-4 py-2 font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                                {rec.lastProcessedAt
                                  ? new Date(
                                      rec.lastProcessedAt
                                    ).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })
                                  : '—'}
                              </td>

                              <td className="px-4 py-2 font-mono tabular-nums">
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={editEmail}
                                    onChange={(e) =>
                                      setEditEmail(e.target.value)
                                    }
                                    className="w-full rounded border border-blue-500 bg-white px-2 py-1 font-mono text-xs text-slate-900 focus:outline-none dark:bg-slate-800 dark:text-slate-100"
                                  />
                                ) : (
                                  <span
                                    className={
                                      rec.validationFlags.invalidEmail
                                        ? 'text-red-600 dark:text-red-400'
                                        : 'text-slate-800 dark:text-slate-200'
                                    }
                                  >
                                    {rec.email || 'Empty address'}
                                  </span>
                                )}
                              </td>

                              <td className="px-4 py-2">
                                <span className={recStatusClass}>
                                  {formatRecipientStatusLabel(rec.status)}
                                </span>
                              </td>

                              <td className="px-4 py-2 text-right">
                                <div className="inline-flex items-center justify-end gap-1.5">
                                  {isEditing ? (
                                    <button
                                      type="button"
                                      onClick={() => saveEditing(rec)}
                                      className="inline-flex items-center gap-1 rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
                                    >
                                      <Check className="h-3 w-3" />
                                      <span>Save</span>
                                    </button>
                                  ) : (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          onOpenInBatchWorkspace(
                                            rec.id,
                                            brand.brandId
                                          )
                                        }
                                        disabled={
                                          rec.excluded ||
                                          rec.status === 'Invalid'
                                        }
                                        title="Open Recipient in Batch Workspace"
                                        className="rounded p-1 text-slate-500 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-blue-400"
                                      >
                                        <Play className="h-3 w-3" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => startEditing(rec)}
                                        title="Edit Recipient"
                                        className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                                      >
                                        <Edit3 className="h-3 w-3" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => onDeleteContact(rec.id)}
                                        title="Delete Recipient"
                                        className="rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                    </React.Fragment>
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
