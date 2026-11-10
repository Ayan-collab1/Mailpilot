export type ContactStatus =
  | 'Pending'
  | 'Prepared'
  | 'Marked as Sent'
  | 'Skipped'
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
}

export interface Contact {
  id: string;
  brandName: string;
  email: string;
  status: ContactStatus;
  excluded: boolean;
  validationFlags: ValidationFlags;
  customSubject?: string;
  customBody?: string;
  importedAt: string;
  lastProcessedAt?: string;
  sourceFile?: string;
  sheetName?: string;
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
  confidence: 'high' | 'uncertain';
  emptyRowsCount: number;
}

export interface CandidateContact {
  tempId: string;
  rowNumber: number;
  brandName: string;
  email: string;
  status: ContactStatus;
  excluded: boolean;
  validationFlags: ValidationFlags;
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
    emptyRowsIgnored: number;
    validCount: number;
    missingBrandCount: number;
    invalidEmailCount: number;
    duplicateEmailCount: number;
    duplicateBrandCount: number;
  };
}
