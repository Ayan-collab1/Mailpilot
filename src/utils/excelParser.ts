import * as XLSX from 'xlsx';
import {
  CandidateContact,
  ContactStatus,
  ImportAnalysisResult,
  ParsedSheetData,
} from '../types/mailpilot';

const BRAND_COLUMN_SYNONYMS = [
  'brand',
  'brand name',
  'brand_name',
  'brandname',
  'brand names',
  'company',
  'company name',
  'company_name',
  'companyname',
  'business',
  'business name',
  'business_name',
  'businessname',
  'organization',
  'organisation',
  'vendor',
  'partner',
  'client',
  'store',
  'store name',
  'account',
];

const EMAIL_COLUMN_SYNONYMS = [
  'email',
  'emails',
  'email address',
  'email addresses',
  'email_address',
  'email_addresses',
  'emailaddress',
  'e-mail',
  'e-mail address',
  'contact email',
  'contact emails',
  'contact_email',
  'business email',
  'business_email',
  'official email',
  'official_email',
  'work email',
  'press email',
  'marketing email',
  'outreach email',
  'mail',
  'recipient',
  'recipient email',
];

const PHONE_COLUMN_SYNONYMS = [
  'phone',
  'phone number',
  'phone numbers',
  'phone_number',
  'contact number',
  'mobile',
  'tel',
  'telephone',
];

const WEBSITE_NOTES_SYNONYMS = [
  'website',
  'website / notes',
  'website/notes',
  'notes',
  'url',
  'domain',
  'link',
  'remarks',
];

const SOURCE_LIST_SYNONYMS = [
  'source list',
  'source_list',
  'source',
  'category / niche',
  'category',
  'niche',
  'list',
  'segment',
];

/**
 * Validates an email address with strict RFC-inspired syntax checks.
 */
export function isValidEmailAddress(email: string): boolean {
  const trimmed = (email || '').trim();
  if (!trimmed || trimmed.length > 254) return false;
  if (trimmed.includes(' ') || trimmed.includes('..')) return false;
  const emailRegex =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!emailRegex.test(trimmed)) return false;
  const parts = trimmed.split('@');
  if (parts.length !== 2) return false;
  const [localPart, domainPart] = parts;
  if (!localPart || localPart.startsWith('.') || localPart.endsWith('.')) {
    return false;
  }
  const domainParts = domainPart.split('.');
  if (domainParts.some((dp) => dp.length === 0)) return false;
  const tld = domainParts[domainParts.length - 1];
  return tld.length >= 2;
}

/**
 * Strips surrounding quotes, angle brackets, parentheses, and stray punctuation
 * around an email token without corrupting the address itself.
 */
export function normalizeEmailToken(rawToken: string): string {
  let token = (rawToken || '').trim();
  if (!token) return '';

  // Remove mailto: prefix if present
  token = token.replace(/^mailto:/i, '').trim();

  // If formatted like "Name <email@domain.com>", extract inside angle brackets
  const angleMatch = token.match(/<([^<>]+)>/);
  if (angleMatch && angleMatch[1] && angleMatch[1].includes('@')) {
    token = angleMatch[1].trim();
  }

  // Strip surrounding brackets, quotes, parentheses, and trailing/leading punctuation
  token = token
    .replace(/^[<(\["'`\s:;,.]+/, '')
    .replace(/[>)\]"'`\s:;,.]+$/, '')
    .trim();

  return token;
}

export interface ExtractedCellEmail {
  email: string;
  isValid: boolean;
}

export interface CellExtractionResult {
  entries: ExtractedCellEmail[];
  duplicatesRemovedCount: number;
  removedDuplicates: string[];
}

/**
 * Advanced multi-email extraction engine for a single spreadsheet cell.
 *
 * Supports:
 * - Semicolon (;), comma (,), newline (\n, \r\n), and pipe (|) separators
 * - Multiple spaces and mixed separators in the same cell
 * - Emails surrounded by unnecessary spaces, angle brackets, quotes, or punctuation
 * - Deduplication of identical valid/invalid addresses within the same brand cell
 * - Preservation of invalid or unrecognized values for user review (never silently discarded)
 */
export function extractEmailsFromCell(rawCell: string): CellExtractionResult {
  const raw = String(rawCell ?? '').trim();

  if (!raw) {
    return {
      entries: [{ email: '', isValid: false }],
      duplicatesRemovedCount: 0,
      removedDuplicates: [],
    };
  }

  // Step 1: Split by primary structural delimiters (;, ,, newline, |)
  const primaryChunks = raw
    .split(/[;,\r\n|]+/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);

  const rawTokens: string[] = [];

  for (const chunk of primaryChunks) {
    // Check if the chunk is "Display Name <user@domain.com>" with a single angle-bracketed email
    const angleMatches = chunk.match(/<[^<>]+>/g);
    if (
      angleMatches &&
      angleMatches.length === 1 &&
      (chunk.match(/@/g) || []).length === 1
    ) {
      rawTokens.push(normalizeEmailToken(angleMatches[0]));
      continue;
    }

    // Check if the chunk has whitespace-separated tokens where multiple emails or email + invalid token exist
    const whitespaceParts = chunk.split(/\s+/).filter(Boolean);
    if (whitespaceParts.length > 1) {
      const partsWithAt = whitespaceParts.filter((p) => p.includes('@'));
      if (partsWithAt.length >= 2) {
        // Multiple space-separated email tokens in the same chunk
        for (const part of whitespaceParts) {
          const cleaned = normalizeEmailToken(part);
          if (cleaned) rawTokens.push(cleaned);
        }
        continue;
      }

      if (partsWithAt.length === 1) {
        // Could be "Label: user@domain.com" or "user@domain.com invalid_token"
        // Extract all identifiable valid emails or keep tokens if another token looks like a broken email
        const nonAtParts = whitespaceParts.filter((p) => !p.includes('@'));
        const looksLikeBrokenEmail = nonAtParts.some(
          (p) => p.includes('.') && !p.endsWith(':')
        );
        if (looksLikeBrokenEmail) {
          for (const part of whitespaceParts) {
            const cleaned = normalizeEmailToken(part);
            if (cleaned) rawTokens.push(cleaned);
          }
          continue;
        } else {
          // E.g. "Email: user@domain.com" -> extract the @ token
          const cleaned = normalizeEmailToken(partsWithAt[0]);
          if (cleaned) rawTokens.push(cleaned);
          continue;
        }
      }
    }

    // Single token or unrecognized text phrase without '@'
    const cleaned = normalizeEmailToken(chunk);
    if (cleaned) {
      rawTokens.push(cleaned);
    }
  }

  if (rawTokens.length === 0) {
    return {
      entries: [{ email: '', isValid: false }],
      duplicatesRemovedCount: 0,
      removedDuplicates: [],
    };
  }

  // Deduplicate within the same brand (case-insensitive) while preserving order
  const seenWithinBrand = new Set<string>();
  const entries: ExtractedCellEmail[] = [];
  const removedDuplicates: string[] = [];

  for (const token of rawTokens) {
    const normalizedKey = token.toLowerCase();
    if (seenWithinBrand.has(normalizedKey)) {
      removedDuplicates.push(token);
      continue;
    }
    seenWithinBrand.add(normalizedKey);
    const valid = isValidEmailAddress(token);
    entries.push({
      email: valid ? token : token,
      isValid: valid,
    });
  }

  return {
    entries,
    duplicatesRemovedCount: removedDuplicates.length,
    removedDuplicates,
  };
}

function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[^a-z0-9\s_/-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detects Brand Name, Email Address, and optional metadata columns (Phone, Website/Notes, Source List).
 */
export function detectColumns(
  headers: string[],
  rows: Record<string, string>[]
): {
  brandCol: string | null;
  emailCol: string | null;
  phoneCol: string | null;
  websiteCol: string | null;
  sourceCol: string | null;
  confidence: 'high' | 'uncertain';
} {
  if (headers.length === 0) {
    return {
      brandCol: null,
      emailCol: null,
      phoneCol: null,
      websiteCol: null,
      sourceCol: null,
      confidence: 'uncertain',
    };
  }

  let matchedBrandCol: string | null = null;
  let matchedEmailCol: string | null = null;
  let matchedPhoneCol: string | null = null;
  let matchedWebsiteCol: string | null = null;
  let matchedSourceCol: string | null = null;
  let exactBrandMatch = false;
  let exactEmailMatch = false;

  // 1. Exact synonym matching on header names
  for (const header of headers) {
    const norm = normalizeHeader(header);
    if (!matchedEmailCol && EMAIL_COLUMN_SYNONYMS.includes(norm)) {
      matchedEmailCol = header;
      exactEmailMatch = true;
    }
    if (!matchedBrandCol && BRAND_COLUMN_SYNONYMS.includes(norm)) {
      matchedBrandCol = header;
      exactBrandMatch = true;
    }
    if (!matchedPhoneCol && PHONE_COLUMN_SYNONYMS.includes(norm)) {
      matchedPhoneCol = header;
    }
    if (!matchedWebsiteCol && WEBSITE_NOTES_SYNONYMS.includes(norm)) {
      matchedWebsiteCol = header;
    }
    if (!matchedSourceCol && SOURCE_LIST_SYNONYMS.includes(norm)) {
      matchedSourceCol = header;
    }
  }

  // 2. Partial substring header matching
  if (!matchedEmailCol) {
    for (const header of headers) {
      const norm = normalizeHeader(header);
      if (norm.includes('email') || norm.includes('e-mail') || norm === 'mail') {
        matchedEmailCol = header;
        break;
      }
    }
  }

  if (!matchedBrandCol) {
    for (const header of headers) {
      if (header === matchedEmailCol) continue;
      const norm = normalizeHeader(header);
      if (
        norm.includes('brand') ||
        norm.includes('company') ||
        norm.includes('business') ||
        norm.includes('organization') ||
        norm === 'name'
      ) {
        matchedBrandCol = header;
        break;
      }
    }
  }

  if (!matchedPhoneCol) {
    for (const header of headers) {
      const norm = normalizeHeader(header);
      if (norm.includes('phone') || norm.includes('mobile') || norm.includes('tel')) {
        matchedPhoneCol = header;
        break;
      }
    }
  }

  if (!matchedWebsiteCol) {
    for (const header of headers) {
      const norm = normalizeHeader(header);
      if (norm.includes('website') || norm.includes('note') || norm.includes('url')) {
        matchedWebsiteCol = header;
        break;
      }
    }
  }

  if (!matchedSourceCol) {
    for (const header of headers) {
      const norm = normalizeHeader(header);
      if (norm.includes('source') || norm.includes('category') || norm.includes('list')) {
        matchedSourceCol = header;
        break;
      }
    }
  }

  // 3. Content-based heuristic scanning across sample rows
  const sampleRows = rows.slice(0, 40);
  if (!matchedEmailCol && sampleRows.length > 0) {
    let bestCol: string | null = null;
    let bestScore = 0;

    for (const header of headers) {
      let emailLikeCount = 0;
      for (const r of sampleRows) {
        const val = (r[header] || '').trim();
        if (val.includes('@') && val.includes('.')) {
          emailLikeCount++;
        }
      }
      const ratio = emailLikeCount / sampleRows.length;
      if (ratio > bestScore && ratio >= 0.2) {
        bestScore = ratio;
        bestCol = header;
      }
    }
    if (bestCol) {
      matchedEmailCol = bestCol;
    }
  }

  if (!matchedBrandCol && sampleRows.length > 0) {
    let bestCol: string | null = null;
    let bestScore = 0;

    for (const header of headers) {
      if (header === matchedEmailCol) continue;
      const norm = normalizeHeader(header);
      if (
        [
          'id',
          'row',
          'index',
          'phone',
          'phone number',
          'date',
          'status',
          'url',
          'website',
          'website / notes',
          'source list',
          'country',
          'city',
        ].includes(norm)
      ) {
        continue;
      }
      let textCount = 0;
      for (const r of sampleRows) {
        const val = (r[header] || '').trim();
        if (val.length >= 2 && !val.includes('@') && !/^\d+$/.test(val)) {
          textCount++;
        }
      }
      const ratio = textCount / sampleRows.length;
      if (ratio > bestScore && ratio >= 0.25) {
        bestScore = ratio;
        bestCol = header;
      }
    }
    if (bestCol) {
      matchedBrandCol = bestCol;
    }
  }

  // Fallback to first two distinct columns if still null, but mark confidence as uncertain
  if (!matchedEmailCol && headers.length > 0) {
    matchedEmailCol = headers.find((h) => h !== matchedBrandCol) || headers[0];
  }
  if (!matchedBrandCol && headers.length > 0) {
    matchedBrandCol = headers.find((h) => h !== matchedEmailCol) || headers[0];
  }

  const confidence: 'high' | 'uncertain' =
    exactBrandMatch && exactEmailMatch && matchedBrandCol !== matchedEmailCol
      ? 'high'
      : 'uncertain';

  return {
    brandCol: matchedBrandCol,
    emailCol: matchedEmailCol,
    phoneCol: matchedPhoneCol,
    websiteCol: matchedWebsiteCol,
    sourceCol: matchedSourceCol,
    confidence,
  };
}

/**
 * Builds candidate contacts and validation summary for a given sheet and column mapping.
 *
 * Key multi-email brand behaviors:
 * - Extracts all email addresses from each brand's email cell (supporting ;, ,, newline, |, spaces).
 * - Deduplicates identical emails within the same brand row.
 * - Preserves invalid/unrecognized tokens as 'Invalid' candidates for user review.
 * - Never merges different brands simply because they share an email address.
 * - If the same email appears under two different brands, preserves both brand associations as active.
 * - If the same brand name appears across multiple rows in the same spreadsheet, merges its unique emails
 *   into that brand while counting duplicate brand rows / duplicate emails within the brand.
 */
export function buildAnalysisForSheet(
  fileName: string,
  sheets: ParsedSheetData[],
  activeSheetName: string,
  brandColumn: string,
  emailColumn: string,
  confidenceOverride?: 'high' | 'uncertain'
): ImportAnalysisResult {
  const sheet =
    sheets.find((s) => s.sheetName === activeSheetName) || sheets[0];

  if (!sheet) {
    return {
      fileName,
      sheets: [],
      activeSheetName: '',
      brandColumn: '',
      emailColumn: '',
      confidence: 'uncertain',
      candidates: [],
      summary: {
        totalRowsRead: 0,
        totalBrandsDetected: 0,
        totalEmailsExtracted: 0,
        emptyRowsIgnored: 0,
        validCount: 0,
        missingBrandCount: 0,
        invalidEmailCount: 0,
        duplicateEmailCount: 0,
        duplicateBrandCount: 0,
      },
    };
  }

  const phoneCol = sheet.detectedPhoneCol || null;
  const websiteCol = sheet.detectedWebsiteCol || null;
  const sourceCol = sheet.detectedSourceCol || null;

  const candidates: CandidateContact[] = [];
  let validCount = 0;
  let missingBrandCount = 0;
  let invalidEmailCount = 0;
  let duplicateEmailCount = 0;
  let duplicateBrandCount = 0;
  let totalBrandsDetected = 0;

  const encounteredBrands = new Map<
    string,
    { brandTempId: string; seenEmails: Set<string> }
  >();

  const timestampSeed = Date.now();

  sheet.rows.forEach((row, rowIdx) => {
    const brandName = (row[brandColumn] || '').trim();
    const rawEmailCell = row[emailColumn] || '';
    const phone = phoneCol ? (row[phoneCol] || '').trim() : undefined;
    const websiteNotes = websiteCol ? (row[websiteCol] || '').trim() : undefined;
    const sourceList = sourceCol ? (row[sourceCol] || '').trim() : undefined;

    const missingBrand = brandName.length === 0;
    const brandKey = brandName.toLowerCase();

    let brandTempId: string;
    let brandSeenEmails: Set<string>;
    let isDupBrandRow = false;

    if (!missingBrand && encounteredBrands.has(brandKey)) {
      const existingBrand = encounteredBrands.get(brandKey)!;
      brandTempId = existingBrand.brandTempId;
      brandSeenEmails = existingBrand.seenEmails;
      isDupBrandRow = true;
      duplicateBrandCount++;
    } else {
      brandTempId = `brand_row_${rowIdx}_${timestampSeed}`;
      brandSeenEmails = new Set<string>();
      totalBrandsDetected++;
      if (!missingBrand) {
        encounteredBrands.set(brandKey, {
          brandTempId,
          seenEmails: brandSeenEmails,
        });
      }
    }

    const extraction = extractEmailsFromCell(rawEmailCell);
    duplicateEmailCount += extraction.duplicatesRemovedCount;

    // Also filter out any email already seen in an earlier row of the EXACT SAME brand
    const uniqueEntriesForRow = extraction.entries.filter((entry) => {
      const emailKey = entry.email.toLowerCase();
      if (emailKey && brandSeenEmails.has(emailKey)) {
        duplicateEmailCount++;
        return false;
      }
      if (emailKey) {
        brandSeenEmails.add(emailKey);
      }
      return true;
    });

    const totalInRow = uniqueEntriesForRow.length;

    uniqueEntriesForRow.forEach((entry, entryIdx) => {
      const invalidEmail = !entry.isValid;
      if (missingBrand) missingBrandCount++;
      if (invalidEmail) invalidEmailCount++;

      const status: ContactStatus = invalidEmail ? 'Invalid' : 'Pending';
      if (!invalidEmail && !missingBrand) {
        validCount++;
      }

      candidates.push({
        tempId: `cand_${rowIdx}_${entryIdx}_${timestampSeed}`,
        brandTempId,
        rowNumber: rowIdx + 2,
        brandName,
        email: entry.email,
        recipientIndex: entryIdx + 1,
        totalBrandRecipients: totalInRow,
        status,
        // Do not silently discard invalid contacts; keep them visible in preview.
        // Note: Cross-brand shared emails are NOT excluded (Requirement 2.8).
        excluded: invalidEmail,
        validationFlags: {
          missingBrand,
          invalidEmail,
          duplicateEmail: false,
          duplicateBrand: isDupBrandRow,
        },
        phone,
        websiteNotes,
        sourceList,
        rawRowData: { ...row },
      });
    });
  });

  // Recalculate recipientIndex and totalBrandRecipients per brandTempId in case a brand spanned multiple rows
  const brandCounts = new Map<string, number>();
  for (const c of candidates) {
    brandCounts.set(c.brandTempId, (brandCounts.get(c.brandTempId) || 0) + 1);
  }
  const brandRunningIdx = new Map<string, number>();
  for (const c of candidates) {
    const nextIdx = (brandRunningIdx.get(c.brandTempId) || 0) + 1;
    brandRunningIdx.set(c.brandTempId, nextIdx);
    c.recipientIndex = nextIdx;
    c.totalBrandRecipients = brandCounts.get(c.brandTempId) || 1;
  }

  return {
    fileName,
    sheets,
    activeSheetName: sheet.sheetName,
    brandColumn,
    emailColumn,
    confidence: confidenceOverride ?? sheet.confidence,
    candidates,
    summary: {
      totalRowsRead: sheet.rows.length + sheet.emptyRowsCount,
      totalBrandsDetected,
      totalEmailsExtracted: candidates.length,
      emptyRowsIgnored: sheet.emptyRowsCount,
      validCount,
      missingBrandCount,
      invalidEmailCount,
      duplicateEmailCount,
      duplicateBrandCount,
    },
  };
}

/**
 * Parses an uploaded Excel (.xlsx, .xls) or CSV (.csv) File in the browser.
 */
export async function parseUploadedSpreadsheet(
  file: File
): Promise<ImportAnalysisResult> {
  const validExtensions = ['.xlsx', '.xls', '.csv'];
  const lowerName = file.name.toLowerCase();
  const hasValidExt = validExtensions.some((ext) => lowerName.endsWith(ext));

  if (!hasValidExt) {
    throw new Error(
      `Unsupported file format "${file.name}". Please upload an Excel (.xlsx, .xls) or CSV (.csv) file.`
    );
  }

  const buffer = await file.arrayBuffer();
  if (buffer.byteLength === 0) {
    throw new Error('The uploaded file is empty (0 bytes).');
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  } catch {
    throw new Error(
      'Unable to read the spreadsheet file. It may be corrupted or in an unsupported format.'
    );
  }

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('No worksheets were found inside the uploaded file.');
  }

  const parsedSheets: ParsedSheetData[] = [];

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) continue;

    const rawMatrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: '',
      blankrows: true,
    });

    if (!rawMatrix || rawMatrix.length === 0) continue;

    let headerRowIndex = -1;
    for (let i = 0; i < rawMatrix.length; i++) {
      const row = rawMatrix[i];
      if (
        Array.isArray(row) &&
        row.some((cell) => String(cell ?? '').trim().length > 0)
      ) {
        headerRowIndex = i;
        break;
      }
    }

    if (headerRowIndex === -1) continue;

    const rawHeaderRow = rawMatrix[headerRowIndex] as unknown[];
    const headers: string[] = rawHeaderRow.map((cell, idx) => {
      const str = String(cell ?? '').trim();
      return str.length > 0 ? str : `Column ${idx + 1}`;
    });

    const uniqueHeaders: string[] = [];
    const headerCounts = new Map<string, number>();
    for (const h of headers) {
      const count = headerCounts.get(h) || 0;
      headerCounts.set(h, count + 1);
      uniqueHeaders.push(count === 0 ? h : `${h} (${count + 1})`);
    }

    const rows: Record<string, string>[] = [];
    let emptyRowsCount = 0;

    for (let rIdx = headerRowIndex + 1; rIdx < rawMatrix.length; rIdx++) {
      const rawRow = rawMatrix[rIdx];
      if (!Array.isArray(rawRow)) {
        emptyRowsCount++;
        continue;
      }

      const hasAnyContent = rawRow.some(
        (cell) => String(cell ?? '').trim().length > 0
      );
      if (!hasAnyContent) {
        emptyRowsCount++;
        continue;
      }

      const rowObj: Record<string, string> = {};
      uniqueHeaders.forEach((colName, cIdx) => {
        const val = rawRow[cIdx];
        rowObj[colName] =
          val !== undefined && val !== null ? String(val).trim() : '';
      });
      rows.push(rowObj);
    }

    if (rows.length === 0 && uniqueHeaders.length === 0) continue;

    const detection = detectColumns(uniqueHeaders, rows);
    parsedSheets.push({
      sheetName,
      headers: uniqueHeaders,
      rows,
      detectedBrandCol: detection.brandCol,
      detectedEmailCol: detection.emailCol,
      detectedPhoneCol: detection.phoneCol,
      detectedWebsiteCol: detection.websiteCol,
      detectedSourceCol: detection.sourceCol,
      confidence: detection.confidence,
      emptyRowsCount,
    });
  }

  const nonEmptySheets = parsedSheets.filter((s) => s.rows.length > 0);
  if (nonEmptySheets.length === 0) {
    throw new Error(
      'The uploaded spreadsheet contains no contact rows to import. Please check that your file has data rows below the header.'
    );
  }

  const primarySheet = nonEmptySheets[0];
  const brandColumn =
    primarySheet.detectedBrandCol || primarySheet.headers[0] || '';
  const emailColumn =
    primarySheet.detectedEmailCol ||
    primarySheet.headers[1] ||
    primarySheet.headers[0] ||
    '';

  return buildAnalysisForSheet(
    file.name,
    nonEmptySheets,
    primarySheet.sheetName,
    brandColumn,
    emailColumn,
    primarySheet.confidence
  );
}

/**
 * 50-Brand Reference Dataset modelled after the real multi-email brand outreach spreadsheet:
 * Columns: Brand Name, Email Addresses, Phone Numbers, Website / Notes, Source List
 * Contains exactly 50 brands with single and multiple (2 to 6) emails per brand (~90+ recipients total).
 */
export const SAMPLE_50_BRANDS_DATA: {
  'Brand Name': string;
  'Email Addresses': string;
  'Phone Numbers': string;
  'Website / Notes': string;
  'Source List': string;
}[] = [
  {
    'Brand Name': 'Flipkart',
    'Email Addresses':
      'abhishek.kumar@flipkart.com; abhyudya.rathour@flipkart.com; rupa.choudhury@flipkart.com; payal.shand@flipkart.com',
    'Phone Numbers': '+91 80 4940 0000',
    'Website / Notes': 'https://flipkart.com · E-Commerce Marketplace',
    'Source List': 'India Retail & D2C',
  },
  {
    'Brand Name': 'Meesho',
    'Email Addresses': 'ajay.rathore@meesho.com; kiran.singh@meesho.com',
    'Phone Numbers': '+91 80 6179 9600',
    'Website / Notes': 'https://meesho.com · Social Commerce',
    'Source List': 'India Retail & D2C',
  },
  {
    'Brand Name': 'boAt',
    'Email Addresses':
      'manila.jolly@imaginemarketingindia.com; kashish.kapoor@imaginemarketingindia.com; shreya.chopra@imaginemarketingindia.com',
    'Phone Numbers': '+91 22 6918 1920',
    'Website / Notes': 'https://boat-lifestyle.com · Consumer Audio',
    'Source List': 'Consumer Electronics',
  },
  {
    'Brand Name': 'Nykaa',
    'Email Addresses':
      'pr@nykaa.com; partnerships@nykaa.com; brand.collab@nykaa.com; media@nykaa.com; influencer@nykaa.com; outreach@nykaa.com',
    'Phone Numbers': '+91 22 6614 9600',
    'Website / Notes': 'https://nykaa.com · Beauty & Personal Care',
    'Source List': 'Beauty & Lifestyle',
  },
  {
    'Brand Name': 'Mamaearth',
    'Email Addresses': 'partnerships@mamaearth.in; media@honasa.in; creators@mamaearth.in',
    'Phone Numbers': '+91 124 419 1300',
    'Website / Notes': 'https://mamaearth.in · Honasa Consumer',
    'Source List': 'Beauty & Lifestyle',
  },
  {
    'Brand Name': 'Lenskart',
    'Email Addresses': 'marketing@lenskart.com; collabs@lenskart.in',
    'Phone Numbers': '+91 99998 99998',
    'Website / Notes': 'https://lenskart.com · Eyewear D2C',
    'Source List': 'India Retail & D2C',
  },
  {
    'Brand Name': 'Zomato',
    'Email Addresses': 'pr@zomato.com; brand@zomato.com; campaigns@zomato.com',
    'Phone Numbers': '+91 124 426 8565',
    'Website / Notes': 'https://zomato.com · Food Delivery',
    'Source List': 'Consumer Apps',
  },
  {
    'Brand Name': 'Swiggy',
    'Email Addresses': 'partnerships@swiggy.in; marketing@swiggy.in',
    'Phone Numbers': '+91 80 6817 9777',
    'Website / Notes': 'https://swiggy.com · Quick Commerce',
    'Source List': 'Consumer Apps',
  },
  {
    'Brand Name': 'Myntra',
    'Email Addresses': 'influencer.marketing@myntra.com; studio@myntra.com; pr@myntra.com',
    'Phone Numbers': '+91 80 6156 1999',
    'Website / Notes': 'https://myntra.com · Fashion Retail',
    'Source List': 'Fashion & Apparel',
  },
  {
    'Brand Name': 'Noise',
    'Email Addresses': 'collab@gonoise.com; marketing@nexxbase.com',
    'Phone Numbers': '+91 88821 32132',
    'Website / Notes': 'https://gonoise.com · Smart Wearables',
    'Source List': 'Consumer Electronics',
  },
  {
    'Brand Name': 'Sugar Cosmetics',
    'Email Addresses': 'influencer@sugarcosmetics.com; pr@sugarcosmetics.com',
    'Phone Numbers': '+91 22 2847 1111',
    'Website / Notes': 'https://sugarcosmetics.com · Cosmetics',
    'Source List': 'Beauty & Lifestyle',
  },
  {
    'Brand Name': 'Minimalist',
    'Email Addresses': 'hello@beminimalist.co; partnerships@beminimalist.co',
    'Phone Numbers': '+91 141 493 1700',
    'Website / Notes': 'https://beminimalist.co · Skincare',
    'Source List': 'Beauty & Lifestyle',
  },
  {
    'Brand Name': 'Wakefit',
    'Email Addresses': 'marketing@wakefit.co; pr@wakefit.co',
    'Phone Numbers': '+91 80 4710 7788',
    'Website / Notes': 'https://wakefit.co · Home & Sleep',
    'Source List': 'Home & Living',
  },
  {
    'Brand Name': 'Licious',
    'Email Addresses': 'brand@licious.com; media@licious.com',
    'Phone Numbers': '+91 80 4711 4444',
    'Website / Notes': 'https://licious.in · D2C Food',
    'Source List': 'Food & Beverage',
  },
  {
    'Brand Name': 'Sleepy Owl Coffee',
    'Email Addresses': 'hello@sleepyowl.co; partnerships@sleepyowl.co',
    'Phone Numbers': '+91 11 4105 9000',
    'Website / Notes': 'https://sleepyowl.co · Specialty Coffee',
    'Source List': 'Food & Beverage',
  },
  {
    'Brand Name': 'Blue Tokai',
    'Email Addresses': 'marketing@bluetokaicoffee.com; events@bluetokaicoffee.com',
    'Phone Numbers': '+91 96060 47077',
    'Website / Notes': 'https://bluetokaicoffee.com · Coffee Roasters',
    'Source List': 'Food & Beverage',
  },
  {
    'Brand Name': 'The Whole Truth',
    'Email Addresses': 'listen@thewholetruthfoods.com; collabs@thewholetruthfoods.com',
    'Phone Numbers': '+91 22 4971 2000',
    'Website / Notes': 'https://thewholetruthfoods.com · Clean Label',
    'Source List': 'Food & Beverage',
  },
  {
    'Brand Name': 'Plum Goodness',
    'Email Addresses': 'pr@plumgoodness.com; creators@plumgoodness.com',
    'Phone Numbers': '+91 22 2583 5500',
    'Website / Notes': 'https://plumgoodness.com · Vegan Beauty',
    'Source List': 'Beauty & Lifestyle',
  },
  {
    'Brand Name': 'mCaffeine',
    'Email Addresses': 'influencer@mcaffeine.com; media@mcaffeine.com',
    'Phone Numbers': '+91 22 4893 1200',
    'Website / Notes': 'https://mcaffeine.com · Personal Care',
    'Source List': 'Beauty & Lifestyle',
  },
  {
    'Brand Name': 'Bewakoof',
    'Email Addresses': 'marketing@bewakoof.com; pr@bewakoof.com',
    'Phone Numbers': '+91 22 6127 9000',
    'Website / Notes': 'https://bewakoof.com · Youth Apparel',
    'Source List': 'Fashion & Apparel',
  },
  {
    'Brand Name': 'Snitch',
    'Email Addresses': 'collabs@snitch.co.in; marketing@snitch.co.in',
    'Phone Numbers': '+91 80 4680 9900',
    'Website / Notes': 'https://snitch.co.in · Menswear D2C',
    'Source List': 'Fashion & Apparel',
  },
  {
    'Brand Name': 'Souled Store',
    'Email Addresses': 'partnerships@thesouledstore.com; media@thesouledstore.com',
    'Phone Numbers': '+91 22 6849 3300',
    'Website / Notes': 'https://thesouledstore.com · Pop Culture',
    'Source List': 'Fashion & Apparel',
  },
  {
    'Brand Name': 'Mokobara',
    'Email Addresses': 'hello@mokobara.com; creators@mokobara.com',
    'Phone Numbers': '+91 80 4123 8800',
    'Website / Notes': 'https://mokobara.com · Travel & Luggage',
    'Source List': 'Travel & Lifestyle',
  },
  {
    'Brand Name': 'DailyObjects',
    'Email Addresses': 'press@dailyobjects.com; collaborations@dailyobjects.com',
    'Phone Numbers': '+91 124 401 2400',
    'Website / Notes': 'https://dailyobjects.com · Tech Accessories',
    'Source List': 'Consumer Electronics',
  },
  {
    'Brand Name': 'Atomberg',
    'Email Addresses': 'marketing@atomberg.com; pr@atomberg.com',
    'Phone Numbers': '+91 22 6819 7000',
    'Website / Notes': 'https://atomberg.com · Smart Appliances',
    'Source List': 'Home & Living',
  },
  {
    'Brand Name': 'Framer',
    'Email Addresses': 'partnerships@framer.com; community@framer.com',
    'Phone Numbers': '+1 415 800 2100',
    'Website / Notes': 'https://framer.com · Design & Publishing',
    'Source List': 'SaaS & Creator Tools',
  },
  {
    'Brand Name': 'Raycast',
    'Email Addresses': 'creators@raycast.com; press@raycast.com',
    'Phone Numbers': '+44 20 7946 0192',
    'Website / Notes': 'https://raycast.com · Productivity Launcher',
    'Source List': 'SaaS & Creator Tools',
  },
  {
    'Brand Name': 'Writesonic',
    'Email Addresses': 'hello@writesonic.com',
    'Phone Numbers': '+1 650 555 0140',
    'Website / Notes': 'https://writesonic.com · AI Writing',
    'Source List': 'SaaS & Creator Tools',
  },
  {
    'Brand Name': 'Murf AI',
    'Email Addresses': 'contact@murf.ai; partnerships@murf.ai',
    'Phone Numbers': '+1 801 555 0199',
    'Website / Notes': 'https://murf.ai · Voice Synthesis',
    'Source List': 'SaaS & Creator Tools',
  },
  {
    'Brand Name': 'Render',
    'Email Addresses': 'outreach@render.com',
    'Phone Numbers': '+1 415 555 0133',
    'Website / Notes': 'https://render.com · Cloud Hosting',
    'Source List': 'SaaS & Creator Tools',
  },
  {
    'Brand Name': 'Obsidian',
    'Email Addresses': 'press@obsidian.md',
    'Phone Numbers': '',
    'Website / Notes': 'https://obsidian.md · Knowledge Base',
    'Source List': 'SaaS & Creator Tools',
  },
  {
    'Brand Name': 'Descript',
    'Email Addresses': 'brand@descript.com; creators@descript.com',
    'Phone Numbers': '+1 415 555 0182',
    'Website / Notes': 'https://descript.com · Video Editing',
    'Source List': 'SaaS & Creator Tools',
  },
  {
    'Brand Name': 'ScreenStudio',
    'Email Addresses': 'hello@screen.studio',
    'Phone Numbers': '',
    'Website / Notes': 'https://screen.studio · Screen Recorder',
    'Source List': 'SaaS & Creator Tools',
  },
  {
    'Brand Name': 'Turso',
    'Email Addresses': 'community@turso.tech',
    'Phone Numbers': '',
    'Website / Notes': 'https://turso.tech · Edge Database',
    'Source List': 'SaaS & Creator Tools',
  },
  {
    'Brand Name': 'Rode Microphones',
    'Email Addresses': 'collab@rode.com; media@rode.com',
    'Phone Numbers': '+61 2 9648 5855',
    'Website / Notes': 'https://rode.com · Studio Audio',
    'Source List': 'Hardware & Gear',
  },
  {
    'Brand Name': 'Elgato',
    'Email Addresses': 'sponsorships@elgato.com; creators@elgato.com',
    'Phone Numbers': '+1 510 657 8747',
    'Website / Notes': 'https://elgato.com · Creator Hardware',
    'Source List': 'Hardware & Gear',
  },
  {
    'Brand Name': 'Keychron',
    'Email Addresses': 'marketing@keychron.com; press@keychron.com',
    'Phone Numbers': '',
    'Website / Notes': 'https://keychron.com · Mechanical Keyboards',
    'Source List': 'Hardware & Gear',
  },
  {
    'Brand Name': 'Grovemade',
    'Email Addresses': 'partners@grovemade.com',
    'Phone Numbers': '+1 503 555 0171',
    'Website / Notes': 'https://grovemade.com · Desk Accessories',
    'Source List': 'Hardware & Gear',
  },
  {
    'Brand Name': 'Branch Furniture',
    'Email Addresses': 'press@branchfurniture.com',
    'Phone Numbers': '+1 917 555 0162',
    'Website / Notes': 'https://branchfurniture.com · Ergonomic Chairs',
    'Source List': 'Home & Living',
  },
  {
    'Brand Name': 'reMarkable',
    'Email Addresses': 'creators@remarkable.com; pr@remarkable.com',
    'Phone Numbers': '+47 21 55 50 00',
    'Website / Notes': 'https://remarkable.com · Paper Tablet',
    'Source List': 'Hardware & Gear',
  },
  {
    'Brand Name': 'Linear',
    'Email Addresses': 'community@linear.app',
    'Phone Numbers': '',
    'Website / Notes': 'https://linear.app · Issue Tracking',
    'Source List': 'SaaS & Creator Tools',
  },
  {
    'Brand Name': 'Hoppscotch',
    'Email Addresses': 'hello@hoppscotch.io',
    'Phone Numbers': '',
    'Website / Notes': 'https://hoppscotch.io · API Platform',
    'Source List': 'SaaS & Creator Tools',
  },
  {
    'Brand Name': 'Zed Industries',
    'Email Addresses': 'media@zed.dev',
    'Phone Numbers': '',
    'Website / Notes': 'https://zed.dev · Code Editor',
    'Source List': 'SaaS & Creator Tools',
  },
  {
    'Brand Name': 'Warp',
    'Email Addresses': 'advocates@warp.dev; partnerships@warp.dev',
    'Phone Numbers': '',
    'Website / Notes': 'https://warp.dev · Modern Terminal',
    'Source List': 'SaaS & Creator Tools',
  },
  {
    'Brand Name': 'Mintlify',
    'Email Addresses': 'growth@mintlify.com',
    'Phone Numbers': '',
    'Website / Notes': 'https://mintlify.com · Documentation',
    'Source List': 'SaaS & Creator Tools',
  },
  {
    'Brand Name': 'Plausible Analytics',
    'Email Addresses': 'hello@plausible.io',
    'Phone Numbers': '',
    'Website / Notes': 'https://plausible.io · Privacy Analytics',
    'Source List': 'SaaS & Creator Tools',
  },
  {
    'Brand Name': 'Tally Forms',
    'Email Addresses': 'partners@tally.so',
    'Phone Numbers': '',
    'Website / Notes': 'https://tally.so · Form Builder',
    'Source List': 'SaaS & Creator Tools',
  },
  {
    'Brand Name': 'Resend',
    'Email Addresses': 'devrel@resend.com',
    'Phone Numbers': '',
    'Website / Notes': 'https://resend.com · Email API',
    'Source List': 'SaaS & Creator Tools',
  },
  {
    'Brand Name': 'Peak Design',
    'Email Addresses': 'collabs@peakdesign.com; press@peakdesign.com',
    'Phone Numbers': '+1 415 813 1791',
    'Website / Notes': 'https://peakdesign.com · Camera & Travel Gear',
    'Source List': 'Travel & Lifestyle',
  },
  {
    'Brand Name': 'Anker Prime',
    'Email Addresses': 'influencers@anker.com; pr@anker.com',
    'Phone Numbers': '+1 800 988 7973',
    'Website / Notes': 'https://anker.com · Charging Hardware',
    'Source List': 'Hardware & Gear',
  },
];

export function generateSampleWorkbookAnalysis(): ImportAnalysisResult {
  const rows = SAMPLE_50_BRANDS_DATA.map((item) => ({
    'Brand Name': item['Brand Name'],
    'Email Addresses': item['Email Addresses'].trim(),
    'Phone Numbers': item['Phone Numbers'],
    'Website / Notes': item['Website / Notes'],
    'Source List': item['Source List'],
  }));

  const headers = [
    'Brand Name',
    'Email Addresses',
    'Phone Numbers',
    'Website / Notes',
    'Source List',
  ];
  const sheet: ParsedSheetData = {
    sheetName: 'Brand Outreach Q4',
    headers,
    rows,
    detectedBrandCol: 'Brand Name',
    detectedEmailCol: 'Email Addresses',
    detectedPhoneCol: 'Phone Numbers',
    detectedWebsiteCol: 'Website / Notes',
    detectedSourceCol: 'Source List',
    confidence: 'high',
    emptyRowsCount: 2,
  };

  return buildAnalysisForSheet(
    '50_Brand_Outreach_Contacts.xlsx',
    [sheet],
    sheet.sheetName,
    'Brand Name',
    'Email Addresses',
    'high'
  );
}

export function downloadSampleExcelFile(): void {
  const worksheet = XLSX.utils.json_to_sheet(SAMPLE_50_BRANDS_DATA);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Brand Outreach Q4');
  XLSX.writeFile(workbook, 'MailPilot_50_Brands_Sample.xlsx');
}
