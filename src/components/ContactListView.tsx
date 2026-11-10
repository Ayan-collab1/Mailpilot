import React, { useMemo, useState } from 'react';
import {
  ArrowUpDown,
  Check,
  Edit3,
  Play,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { Contact, ContactStatus } from '../types/mailpilot';
import { isValidEmailAddress } from '../utils/excelParser';

interface ContactListViewProps {
  contacts: Contact[];
  initialFilter?: string;
  onOpenImportModal: () => void;
  onUpdateContact: (contactId: string, updates: Partial<Contact>) => void;
  onDeleteContact: (contactId: string) => void;
  onAddManualContact: (brandName: string, email: string) => void;
  onOpenInBatchWorkspace: (contactId: string) => void;
}

type SortField = 'brandName' | 'email' | 'status';
type SortOrder = 'asc' | 'desc';

export const ContactListView: React.FC<ContactListViewProps> = ({
  contacts,
  initialFilter = 'all',
  onOpenImportModal,
  onUpdateContact,
  onDeleteContact,
  onAddManualContact,
  onOpenInBatchWorkspace,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(initialFilter);
  const [sortField, setSortField] = useState<SortField>('brandName');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

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

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const filteredAndSortedContacts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = contacts.filter((c) => {
      if (q) {
        const matchBrand = c.brandName.toLowerCase().includes(q);
        const matchEmail = c.email.toLowerCase().includes(q);
        if (!matchBrand && !matchEmail) return false;
      }
      if (statusFilter === 'all') return true;
      if (statusFilter === 'Excluded') return c.excluded;
      if (statusFilter === 'Invalid') {
        return c.status === 'Invalid' || c.validationFlags.invalidEmail;
      }
      return c.status === statusFilter;
    });

    return [...list].sort((a, b) => {
      const valA = (a[sortField] || '').toLowerCase();
      const valB = (b[sortField] || '').toLowerCase();
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [contacts, searchQuery, statusFilter, sortField, sortOrder]);

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
      excluded: !valid ? true : c.excluded,
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
      all: contacts.length,
      pending: contacts.filter((c) => c.status === 'Pending').length,
      prepared: contacts.filter((c) => c.status === 'Prepared').length,
      sent: contacts.filter((c) => c.status === 'Marked as Sent').length,
      skipped: contacts.filter((c) => c.status === 'Skipped').length,
      invalid: contacts.filter(
        (c) => c.status === 'Invalid' || c.validationFlags.invalidEmail
      ).length,
      excluded: contacts.filter((c) => c.excluded).length,
    };
  }, [contacts]);

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Brand Contact Database
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Search, sort, validate, or exclude individual contacts from your sending queue.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowAddRow((prev) => !prev)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Single Contact</span>
          </button>
          <button
            type="button"
            onClick={onOpenImportModal}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 whitespace-nowrap shrink-0"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Import Excel / CSV</span>
          </button>
        </div>
      </div>

      {/* Add Single Contact Form */}
      {showAddRow && (
        <form
          onSubmit={handleCreateManual}
          className="flex flex-col items-end gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:flex-row dark:border-slate-800 dark:bg-slate-800/40"
        >
          <div className="w-full sm:flex-1">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Brand Name
            </label>
            <input
              type="text"
              value={newBrand}
              onChange={(e) => setNewBrand(e.target.value)}
              placeholder="e.g., Writesonic"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
          <div className="w-full sm:flex-1">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Email Address
            </label>
            <input
              type="text"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="e.g., hello@writesonic.com"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 whitespace-nowrap shrink-0"
            >
              Save Contact
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
            { id: 'all', label: `All (${counts.all})` },
            { id: 'Pending', label: `Pending (${counts.pending})` },
            { id: 'Prepared', label: `Prepared (${counts.prepared})` },
            { id: 'Marked as Sent', label: `Sent (${counts.sent})` },
            { id: 'Skipped', label: `Skipped (${counts.skipped})` },
            { id: 'Invalid', label: `Invalid (${counts.invalid})` },
            { id: 'Excluded', label: `Excluded (${counts.excluded})` },
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
            placeholder="Search by brand or email..."
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pr-3 pl-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
      </div>

      {/* Contact Preview & Management Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {filteredAndSortedContacts.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
              {contacts.length === 0
                ? 'Your contact database is empty'
                : 'No contacts match your current filter or search'}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {contacts.length === 0
                ? 'Upload an Excel (.xlsx, .xls) or CSV file to extract brand names and email addresses.'
                : 'Try clearing the search query or switching to the All tab.'}
            </p>
            {contacts.length === 0 && (
              <button
                type="button"
                onClick={onOpenImportModal}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Import Spreadsheet</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                  <th className="px-4 py-3 font-medium">In Queue</th>
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
                      onClick={() => handleSort('email')}
                      className="inline-flex items-center gap-1 font-medium hover:text-slate-900 dark:hover:text-white"
                    >
                      <span>Email Address</span>
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-4 py-3 font-medium">
                    <button
                      type="button"
                      onClick={() => handleSort('status')}
                      className="inline-flex items-center gap-1 font-medium hover:text-slate-900 dark:hover:text-white"
                    >
                      <span>Status</span>
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredAndSortedContacts.map((contact) => {
                  const isEditing = editingId === contact.id;
                  const warnings: string[] = [];
                  if (contact.validationFlags.missingBrand) warnings.push('Missing brand');
                  if (contact.validationFlags.invalidEmail) warnings.push('Invalid email');
                  if (contact.validationFlags.duplicateEmail) warnings.push('Duplicate email');
                  if (contact.validationFlags.duplicateBrand) warnings.push('Duplicate brand');

                  const statusTextClass =
                    contact.status === 'Marked as Sent'
                      ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                      : contact.status === 'Invalid'
                      ? 'text-red-600 dark:text-red-400 font-medium'
                      : contact.status === 'Skipped'
                      ? 'text-amber-600 dark:text-amber-400 font-medium'
                      : contact.status === 'Prepared'
                      ? 'text-blue-600 dark:text-blue-400 font-medium'
                      : 'text-slate-700 dark:text-slate-300 font-medium';

                  return (
                    <tr
                      key={contact.id}
                      className={`transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40 ${
                        contact.excluded ? 'opacity-60' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={!contact.excluded}
                          onChange={() =>
                            onUpdateContact(contact.id, {
                              excluded: !contact.excluded,
                            })
                          }
                          title={
                            contact.excluded
                              ? 'Excluded from sending queue'
                              : 'Included in sending queue'
                          }
                          className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>

                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editBrand}
                            onChange={(e) => setEditBrand(e.target.value)}
                            className="w-full rounded border border-blue-500 bg-white px-2 py-1 text-xs text-slate-900 focus:outline-none dark:bg-slate-800 dark:text-slate-100"
                          />
                        ) : (
                          <span className="font-medium text-slate-900 dark:text-slate-100">
                            {contact.brandName || (
                              <span className="italic text-amber-600 dark:text-amber-400">
                                Missing Brand Name
                              </span>
                            )}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 font-mono tabular-nums">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editEmail}
                            onChange={(e) => setEditEmail(e.target.value)}
                            className="w-full rounded border border-blue-500 bg-white px-2 py-1 font-mono text-xs text-slate-900 focus:outline-none dark:bg-slate-800 dark:text-slate-100"
                          />
                        ) : (
                          <span
                            className={
                              contact.validationFlags.invalidEmail
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-slate-600 dark:text-slate-300'
                            }
                          >
                            {contact.email || '—'}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span className={statusTextClass}>{contact.status}</span>
                          {contact.excluded && (
                            <>
                              <span aria-hidden="true" className="text-slate-400">
                                ·
                              </span>
                              <span className="text-slate-500">Excluded</span>
                            </>
                          )}
                          {warnings.length > 0 && (
                            <>
                              <span aria-hidden="true" className="text-slate-400">
                                ·
                              </span>
                              <span className="text-amber-600 dark:text-amber-400">
                                {warnings.join(' · ')}
                              </span>
                            </>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {isEditing ? (
                            <button
                              type="button"
                              onClick={() => saveEditing(contact)}
                              className="inline-flex items-center gap-1 rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
                            >
                              <Check className="h-3 w-3" />
                              <span>Save</span>
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => onOpenInBatchWorkspace(contact.id)}
                                disabled={contact.excluded || contact.status === 'Invalid'}
                                title="Prepare in Batch Workspace"
                                className="rounded p-1.5 text-slate-500 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-blue-400"
                              >
                                <Play className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => startEditing(contact)}
                                title="Edit brand or email"
                                className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteContact(contact.id)}
                                title="Remove contact"
                                className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
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
