import {
  ActivityLogItem,
  AppSettings,
  BatchQueueState,
  Contact,
  EmailTemplate,
  HistoryEntry,
} from '../types/mailpilot';
import { buildBrandGroups } from '../utils/brandQueue';

const DB_NAME = 'MailPilotDB';
const DB_VERSION = 1;
const STORE_NAME = 'appState';

const LS_FALLBACK_KEY = 'mailpilot_persistent_state_v1';

export interface PersistentAppState {
  contacts: Contact[];
  templates: EmailTemplate[];
  history: HistoryEntry[];
  activityLog: ActivityLogItem[];
  batchState: BatchQueueState;
  settings: AppSettings;
}

export const INITIAL_TEMPLATES: EmailTemplate[] = [
  {
    id: 'tpl_brand_collab_default',
    name: 'Brand Collaboration Outreach',
    subject: 'Collaboration Opportunity with TrueReach',
    body: `Hi {brand_name} Team,

We would love to explore a potential collaboration opportunity with your brand through TrueReach.

We believe there could be a great opportunity to work together.

Looking forward to hearing from you.

Best Regards,
TrueReach Team
https://truereachc.com`,
    isDefault: true,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'tpl_product_sponsorship',
    name: 'Product Feature & Review Inquiry',
    subject: 'Featuring {brand_name} in Our Upcoming Tech Showcase',
    body: `Hi {brand_name} Team,

I'm reaching out to the team at {email} because we've been following {brand_name} closely and would love to feature your flagship product in our upcoming editorial review schedule.

If you're open to discussing a creator partnership or media review kit, please let me know who on the {brand_name} team would be best to connect with.

Warm regards,
TrueReach Editorial`,
    isDefault: false,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'tpl_follow_up',
    name: 'Partnership Follow-Up',
    subject: 'Following up: Partnership inquiry for {brand_name}',
    body: `Hello {brand_name} Team,

Wanted to quickly follow up on my previous note regarding a potential collaboration with {brand_name}.

If this quarter's outreach schedule is already full, no worries at all—otherwise, we'd be delighted to share a brief media overview whenever convenient for you.

Best Regards,
TrueReach Team`,
    isDefault: false,
    updatedAt: new Date().toISOString(),
  },
];

export const INITIAL_SETTINGS: AppSettings = {
  defaultEmailApp: 'thunderbird_mailto',
  defaultTemplateId: 'tpl_brand_collab_default',
  theme: 'light',
};

export const INITIAL_BATCH_STATE: BatchQueueState = {
  currentIndex: 0,
  currentBrandId: null,
  currentRecipientId: null,
  acknowledgedBrandIds: [],
  batchBrandLimit: null,
  batchBrandOffset: 0,
  isActive: false,
  isPaused: false,
  selectedTemplateId: 'tpl_brand_collab_default',
  selectedEmailApp: 'thunderbird_mailto',
  lastProcessedContactId: null,
  preparedContactIds: [],
  lastUpdated: new Date().toISOString(),
};

export const INITIAL_STATE: PersistentAppState = {
  contacts: [],
  templates: INITIAL_TEMPLATES,
  history: [],
  activityLog: [],
  batchState: INITIAL_BATCH_STATE,
  settings: INITIAL_SETTINGS,
};

function openIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const timer = setTimeout(() => {
      reject(new Error('IndexedDB open timeout'));
    }, 1500);

    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => {
        clearTimeout(timer);
        resolve(request.result);
      };
      request.onerror = () => {
        clearTimeout(timer);
        reject(request.error);
      };
      request.onblocked = () => {
        clearTimeout(timer);
        reject(new Error('IndexedDB blocked'));
      };
    } catch (err) {
      clearTimeout(timer);
      reject(err);
    }
  });
}

export async function loadAppState(): Promise<PersistentAppState> {
  try {
    const db = await openIndexedDB();
    const idbData = await new Promise<PersistentAppState | undefined>(
      (resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get('root');
        req.onsuccess = () =>
          resolve(req.result as PersistentAppState | undefined);
        req.onerror = () => reject(req.error);
      }
    );
    db.close();

    if (idbData && Array.isArray(idbData.templates)) {
      return mergeWithDefaults(idbData);
    }
  } catch {
    // Fallback to localStorage
  }

  try {
    const raw = localStorage.getItem(LS_FALLBACK_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistentAppState>;
      return mergeWithDefaults(parsed);
    }
  } catch {
    // Ignore localStorage parse errors
  }

  return INITIAL_STATE;
}

export function mergeWithDefaults(
  partial: Partial<PersistentAppState>
): PersistentAppState {
  const templates =
    Array.isArray(partial.templates) && partial.templates.length > 0
      ? partial.templates
      : INITIAL_TEMPLATES;
  const defaultTpl = templates.find((t) => t.isDefault) || templates[0];

  const rawDefaultApp = partial.settings?.defaultEmailApp;
  const migratedDefaultApp =
    !rawDefaultApp || rawDefaultApp === 'gmail'
      ? 'thunderbird_mailto'
      : rawDefaultApp;

  const rawBatchApp = partial.batchState?.selectedEmailApp;
  const migratedBatchApp =
    !rawBatchApp || rawBatchApp === 'gmail'
      ? migratedDefaultApp
      : rawBatchApp;

  const settings: AppSettings = {
    ...INITIAL_SETTINGS,
    ...(partial.settings || {}),
    defaultEmailApp: migratedDefaultApp,
    defaultTemplateId:
      partial.settings?.defaultTemplateId &&
      templates.some((t) => t.id === partial.settings?.defaultTemplateId)
        ? partial.settings.defaultTemplateId
        : defaultTpl.id,
  };

  // Migrate legacy contacts without brandId into deterministic brand groups
  const legacyBrandIds = new Map<string, string>();
  const normalizedContacts: Contact[] = Array.isArray(partial.contacts)
    ? partial.contacts.map((c, idx) => {
        const brandName = typeof c.brandName === 'string' ? c.brandName : '';
        let brandId = typeof c.brandId === 'string' ? c.brandId : '';
        if (!brandId) {
          const brandKey = brandName.trim().toLowerCase();
          if (brandKey && legacyBrandIds.has(brandKey)) {
            brandId = legacyBrandIds.get(brandKey)!;
          } else {
            brandId = `brand_migrated_${idx}_${brandKey.replace(/[^a-z0-9]/g, '_') || 'unnamed'}`;
            if (brandKey) {
              legacyBrandIds.set(brandKey, brandId);
            }
          }
        }

        return {
          id: c.id || `cnt_restored_${idx}`,
          brandId,
          brandName,
          email: typeof c.email === 'string' ? c.email : '',
          recipientIndex: c.recipientIndex,
          totalBrandRecipients: c.totalBrandRecipients,
          status: c.status || 'Pending',
          excluded: Boolean(c.excluded),
          validationFlags: {
            missingBrand: Boolean(c.validationFlags?.missingBrand),
            invalidEmail: Boolean(c.validationFlags?.invalidEmail),
            duplicateEmail: Boolean(c.validationFlags?.duplicateEmail),
            duplicateBrand: Boolean(c.validationFlags?.duplicateBrand),
            duplicateWithinBrand: Boolean(
              c.validationFlags?.duplicateWithinBrand
            ),
          },
          customSubject: c.customSubject,
          customBody: c.customBody,
          importedAt: c.importedAt || new Date().toISOString(),
          lastProcessedAt: c.lastProcessedAt,
          sourceFile: c.sourceFile,
          sheetName: c.sheetName,
          phone: c.phone,
          websiteNotes: c.websiteNotes,
          sourceList: c.sourceList,
          rawRowData: c.rawRowData,
        };
      })
    : [];

  // Re-populate recipientIndex and totalBrandRecipients from brand groupings
  const brandGroups = buildBrandGroups(normalizedContacts);
  const enrichedMap = new Map<string, Contact>();
  for (const bg of brandGroups) {
    for (const r of bg.recipients) {
      enrichedMap.set(r.id, r);
    }
  }
  const finalContacts = normalizedContacts.map(
    (c) => enrichedMap.get(c.id) || c
  );

  // Resolve currentBrandId and currentRecipientId if migrating from flat currentIndex
  const rawCurrentBrandId = partial.batchState?.currentBrandId ?? null;
  const rawCurrentRecipientId = partial.batchState?.currentRecipientId ?? null;
  let resolvedBrandId = rawCurrentBrandId;
  let resolvedRecipientId = rawCurrentRecipientId;

  if (!resolvedBrandId && finalContacts.length > 0) {
    const queueContacts = finalContacts.filter((c) => !c.excluded);
    const legacyIdx = Math.min(
      Math.max(0, partial.batchState?.currentIndex || 0),
      Math.max(0, queueContacts.length - 1)
    );
    const targetContact = queueContacts[legacyIdx] || finalContacts[0];
    if (targetContact) {
      resolvedBrandId = targetContact.brandId;
      resolvedRecipientId = targetContact.id;
    }
  }

  const batchState: BatchQueueState = {
    ...INITIAL_BATCH_STATE,
    ...(partial.batchState || {}),
    currentBrandId: resolvedBrandId,
    currentRecipientId: resolvedRecipientId,
    acknowledgedBrandIds: Array.isArray(
      partial.batchState?.acknowledgedBrandIds
    )
      ? partial.batchState!.acknowledgedBrandIds
      : [],
    batchBrandLimit:
      partial.batchState?.batchBrandLimit !== undefined
        ? partial.batchState.batchBrandLimit
        : null,
    batchBrandOffset:
      typeof partial.batchState?.batchBrandOffset === 'number'
        ? partial.batchState.batchBrandOffset
        : 0,
    selectedTemplateId:
      partial.batchState?.selectedTemplateId &&
      templates.some((t) => t.id === partial.batchState?.selectedTemplateId)
        ? partial.batchState.selectedTemplateId
        : settings.defaultTemplateId,
    selectedEmailApp: migratedBatchApp,
    preparedContactIds: Array.isArray(partial.batchState?.preparedContactIds)
      ? partial.batchState!.preparedContactIds
      : [],
  };

  return {
    contacts: finalContacts,
    templates,
    history: Array.isArray(partial.history) ? partial.history : [],
    activityLog: Array.isArray(partial.activityLog) ? partial.activityLog : [],
    batchState,
    settings,
  };
}

export async function saveAppState(state: PersistentAppState): Promise<void> {
  try {
    localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(state));
  } catch {
    // Ignore quota errors
  }

  try {
    const db = await openIndexedDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(state, 'root');
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    db.close();
  } catch {
    // Already persisted to localStorage fallback
  }
}

export function escapeCsvCell(value: string): string {
  const str = String(value ?? '');
  if (
    str.includes(',') ||
    str.includes('"') ||
    str.includes('\n') ||
    str.includes('\r')
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportHistoryToCsv(history: HistoryEntry[]): void {
  const headers = [
    'Brand Name',
    'Recipient Email',
    'Subject',
    'Date and Time',
    'Processing Status',
    'Email Application',
  ];
  const rows = history.map((h) => [
    escapeCsvCell(h.brandName),
    escapeCsvCell(h.email),
    escapeCsvCell(h.subject),
    escapeCsvCell(new Date(h.timestamp).toLocaleString()),
    escapeCsvCell(h.status),
    escapeCsvCell(h.emailApp),
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join(
    '\r\n'
  );
  triggerFileDownload(
    csvContent,
    `MailPilot_Sending_History_${new Date().toISOString().slice(0, 10)}.csv`,
    'text/csv;charset=utf-8;'
  );
}

export function exportContactsAndProgressToCsv(contacts: Contact[]): void {
  const brandGroups = buildBrandGroups(contacts);
  const brandStatusMap = new Map<string, string>();
  for (const bg of brandGroups) {
    brandStatusMap.set(bg.brandId, bg.status);
  }

  const headers = [
    'Brand Name',
    'Recipient #',
    'Email Address',
    'Recipient Status',
    'Brand Status',
    'Queue Inclusion',
    'Phone Number',
    'Website / Notes',
    'Source List',
    'Source File',
    'Last Processed',
  ];
  const rows = contacts.map((c) => [
    escapeCsvCell(c.brandName),
    escapeCsvCell(
      c.recipientIndex && c.totalBrandRecipients
        ? `${c.recipientIndex}/${c.totalBrandRecipients}`
        : '1/1'
    ),
    escapeCsvCell(c.email),
    escapeCsvCell(c.status),
    escapeCsvCell(brandStatusMap.get(c.brandId) || 'Pending'),
    escapeCsvCell(c.excluded ? 'Excluded' : 'Included'),
    escapeCsvCell(c.phone || ''),
    escapeCsvCell(c.websiteNotes || ''),
    escapeCsvCell(c.sourceList || ''),
    escapeCsvCell(c.sourceFile || 'Manual / Imported'),
    escapeCsvCell(
      c.lastProcessedAt ? new Date(c.lastProcessedAt).toLocaleString() : '—'
    ),
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join(
    '\r\n'
  );
  triggerFileDownload(
    csvContent,
    `MailPilot_Contacts_Progress_${new Date().toISOString().slice(0, 10)}.csv`,
    'text/csv;charset=utf-8;'
  );
}

export function exportFullBackupJson(state: PersistentAppState): void {
  const jsonContent = JSON.stringify(state, null, 2);
  triggerFileDownload(
    jsonContent,
    `MailPilot_Backup_${new Date().toISOString().slice(0, 10)}.json`,
    'application/json;charset=utf-8;'
  );
}

function triggerFileDownload(
  content: string,
  fileName: string,
  mimeType: string
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
