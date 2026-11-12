export type ContactStatus =
  | 'Pending'
  | 'Prepared'
  | 'Marked as Sent'
  | 'Skipped'
  | 'Invalid';

export type BrandStatus =
  | 'Pending'
  | 'In Progress'
  | 'Completed'
  | 'Needs Attention'
  | 'Invalid';

export type EmailAppType =
  | 'thunderbird_mailto'
  | 'default_mailto'
  | 'compatible_mailto'
  | 'gmail'
  | 'outlook';

export type NavigationTab =
  | 'dashboard'
  | 'contacts'
  | 'batch'
  | 'templates'
  | 'history'
  | 'settings';

export interface ValidationFlags {
  missingBrand: boolean;
  invalidEmail: boolean;
  duplicateEmail: boolean;
  duplicateBrand: boolean;
  duplicateWithinBrand?: boolean;
}

export interface Contact {
  id: string;
  brandId: string;
  brandName: string;
  email: string;
  recipientIndex?: number;
  totalBrandRecipients?: number;
  status: ContactStatus;
  excluded: boolean;
  validationFlags: ValidationFlags;
  customSubject?: string;
  customBody?: string;
  importedAt: string;
  lastProcessedAt?: string;
  sourceFile?: string;
  sheetName?: string;
  phone?: string;
  websiteNotes?: string;
  sourceList?: string;
  rawRowData?: Record<string, string>;
}

export interface BrandGroup {
  brandId: string;
  brandName: string;
  recipients: Contact[];
  totalEmailsFound: number;
  validEmailCount: number;
  invalidEmailCount: number;
  emailsSent: number;
  emailsSkipped: number;
  emailsPrepared: number;
  emailsRemaining: number;
  status: BrandStatus;
  excluded: boolean;
  phone?: string;
  websiteNotes?: string;
  sourceList?: string;
  sourceFile?: string;
  sheetName?: string;
  importedAt: string;
  lastProcessedAt?: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  isDefault: boolean;
  updatedAt: string;
}

export interface HistoryEntry {
  id: string;
  contactId: string;
  brandId?: string;
  brandName: string;
  email: string;
  subject: string;
  timestamp: string;
  status: ContactStatus;
  emailApp: EmailAppType;
}

export interface ActivityLogItem {
  id: string;
  type: 'import' | 'sent' | 'skipped' | 'prepared' | 'template' | 'system';
  title: string;
  detail: string;
  timestamp: string;
}

export interface BatchQueueState {
  currentIndex: number;
  currentBrandId: string | null;
  currentRecipientId: string | null;
  acknowledgedBrandIds: string[];
  batchBrandLimit: number | null;
  batchBrandOffset: number;
  isActive: boolean;
  isPaused: boolean;
  selectedTemplateId: string;
  selectedEmailApp: EmailAppType;
  lastProcessedContactId: string | null;
  preparedContactIds: string[];
  lastUpdated: string;
}

export interface AppSettings {
  defaultEmailApp: EmailAppType;
  defaultTemplateId: string;
  theme: 'light' | 'dark';
}

export interface ParsedSheetData {
  sheetName: string;
  headers: string[];
  rows: Record<string, string>[];
  detectedBrandCol: string | null;
  detectedEmailCol: string | null;
  detectedPhoneCol?: string | null;
  detectedWebsiteCol?: string | null;
  detectedSourceCol?: string | null;
  confidence: 'high' | 'uncertain';
  emptyRowsCount: number;
}

export interface CandidateContact {
  tempId: string;
  brandTempId: string;
  rowNumber: number;
  brandName: string;
  email: string;
  recipientIndex: number;
  totalBrandRecipients: number;
  status: ContactStatus;
  excluded: boolean;
  validationFlags: ValidationFlags;
  phone?: string;
  websiteNotes?: string;
  sourceList?: string;
  rawRowData?: Record<string, string>;
}

export interface ImportAnalysisResult {
  fileName: string;
  sheets: ParsedSheetData[];
  activeSheetName: string;
  brandColumn: string;
  emailColumn: string;
  confidence: 'high' | 'uncertain';
  candidates: CandidateContact[];
  summary: {
    totalRowsRead: number;
    totalBrandsDetected: number;
    totalEmailsExtracted: number;
    emptyRowsIgnored: number;
    validCount: number;
    missingBrandCount: number;
    invalidEmailCount: number;
    duplicateEmailCount: number;
    duplicateBrandCount: number;
  };
}
