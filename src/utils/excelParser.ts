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
  'website',
  'account',
];

const EMAIL_COLUMN_SYNONYMS = [
  'email',
  'email address',
  'email_address',
  'emailaddress',
  'e-mail',
  'e-mail address',
  'contact email',
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
  const domainParts = parts[1].split('.');
  const tld = domainParts[domainParts.length - 1];
  return tld.length >= 2;
}

function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detects the best Brand Name and Email Address columns using both header synonyms
 * and cell content heuristics (so it never blindly assumes column 1 is brand and column 2 is email).
 */
export function detectColumns(
  headers: string[],
  rows: Record<string, string>[]
): {
  brandCol: string | null;
  emailCol: string | null;
  confidence: 'high' | 'uncertain';
} {
  if (headers.length === 0) {
    return { brandCol: null, emailCol: null, confidence: 'uncertain' };
  }

  let matchedBrandCol: string | null = null;
  let matchedEmailCol: string | null = null;
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
      if (ratio > bestScore && ratio >= 0.25) {
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
      // Skip obvious unrelated columns like id, phone, date, notes, status, url
      if (
        ['id', 'row', 'index', 'phone', 'date', 'status', 'url', 'website', 'country', 'city'].includes(
          norm
        )
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
      if (ratio > bestScore && ratio >= 0.3) {
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
    confidence,
  };
}

/**
 * Builds candidate contacts and validation summary for a given sheet and column mapping.
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
        emptyRowsIgnored: 0,
        validCount: 0,
        missingBrandCount: 0,
        invalidEmailCount: 0,
        duplicateEmailCount: 0,
        duplicateBrandCount: 0,
      },
    };
  }

  const seenEmails = new Map<string, number>();
  const seenBrands = new Map<string, number>();

  // First pass to count frequencies for duplicate detection
  for (const row of sheet.rows) {
    const rawBrand = (row[brandColumn] || '').trim();
    const rawEmail = (row[emailColumn] || '').trim().toLowerCase();
    if (rawEmail) {
      seenEmails.set(rawEmail, (seenEmails.get(rawEmail) || 0) + 1);
    }
    if (rawBrand) {
      const brandKey = rawBrand.toLowerCase();
      seenBrands.set(brandKey, (seenBrands.get(brandKey) || 0) + 1);
    }
  }

  const candidates: CandidateContact[] = [];
  let validCount = 0;
  let missingBrandCount = 0;
  let invalidEmailCount = 0;
  let duplicateEmailCount = 0;
  let duplicateBrandCount = 0;

  const encounteredEmails = new Set<string>();
  const encounteredBrands = new Set<string>();

  sheet.rows.forEach((row, index) => {
    const brandName = (row[brandColumn] || '').trim();
    const email = (row[emailColumn] || '').trim();

    const missingBrand = brandName.length === 0;
    const invalidEmail = !isValidEmailAddress(email);

    const emailKey = email.toLowerCase();
    const brandKey = brandName.toLowerCase();

    const isDupEmail = emailKey.length > 0 && encounteredEmails.has(emailKey);
    const isDupBrand = brandKey.length > 0 && encounteredBrands.has(brandKey);

    if (emailKey.length > 0) encounteredEmails.add(emailKey);
    if (brandKey.length > 0) encounteredBrands.add(brandKey);

    if (missingBrand) missingBrandCount++;
    if (invalidEmail) invalidEmailCount++;
    if (isDupEmail) duplicateEmailCount++;
    if (isDupBrand) duplicateBrandCount++;

    const status: ContactStatus = invalidEmail ? 'Invalid' : 'Pending';
    if (!invalidEmail && !missingBrand) {
      validCount++;
    }

    candidates.push({
      tempId: `cand_${index}_${Date.now()}`,
      rowNumber: index + 2,
      brandName,
      email,
      status,
      // Do not silently discard contacts; keep them visible in preview.
      // Auto-exclude only if email is completely invalid or duplicate email occurrence.
      excluded: invalidEmail || isDupEmail,
      validationFlags: {
        missingBrand,
        invalidEmail,
        duplicateEmail: isDupEmail,
        duplicateBrand: isDupBrand,
      },
    });
  });

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

    // Extract as 2D array first so we can count empty rows and handle missing headers cleanly
    const rawMatrix = XLSX.utils.sheet_to_json< unknown[] >(worksheet, {
      header: 1,
      defval: '',
      blankrows: true,
    });

    if (!rawMatrix || rawMatrix.length === 0) continue;

    // Find the first non-empty row as header row
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

    // Deduplicate identical header names if present
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
        rowObj[colName] = val !== undefined && val !== null ? String(val).trim() : '';
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
 * Generates a realistic 50-brand sample dataset for testing the full acceptance workflow
 * (including a few intentional edge cases or 50 clean brands).
 */
export const SAMPLE_50_BRANDS_DATA: {
  'Category / Niche': string;
  'Brand Name': string;
  'Contact Email': string;
  'Website': string;
}[] = [
  { 'Category / Niche': 'Developer Tools', 'Brand Name': 'Techie', 'Contact Email': 'marketing@techie.io', 'Website': 'https://techie.io' },
  { 'Category / Niche': 'AI Writing', 'Brand Name': 'Writesonic', 'Contact Email': 'hello@writesonic.com', 'Website': 'https://writesonic.com' },
  { 'Category / Niche': 'Voice Synthesis', 'Brand Name': 'Murf AI', 'Contact Email': 'contact@murf.ai', 'Website': 'https://murf.ai' },
  { 'Category / Niche': 'Design Systems', 'Brand Name': 'Framer', 'Contact Email': 'partnerships@framer.com', 'Website': 'https://framer.com' },
  { 'Category / Niche': 'Productivity', 'Brand Name': 'Raycast', 'Contact Email': 'creators@raycast.com', 'Website': 'https://raycast.com' },
  { 'Category / Niche': 'Cloud Hosting', 'Brand Name': 'Render', 'Contact Email': 'outreach@render.com', 'Website': 'https://render.com' },
  { 'Category / Niche': 'Knowledge Base', 'Brand Name': 'Obsidian', 'Contact Email': 'press@obsidian.md', 'Website': 'https://obsidian.md' },
  { 'Category / Niche': 'Video Editing', 'Brand Name': 'Descript', 'Contact Email': 'brand@descript.com', 'Website': 'https://descript.com' },
  { 'Category / Niche': 'Screen Recording', 'Brand Name': 'ScreenStudio', 'Contact Email': 'hello@screen.studio', 'Website': 'https://screen.studio' },
  { 'Category / Niche': 'Database Platform', 'Brand Name': 'Turso', 'Contact Email': 'community@turso.tech', 'Website': 'https://turso.tech' },
  { 'Category / Niche': 'Audio Gear', 'Brand Name': 'Rode Microphones', 'Contact Email': 'collab@rode.com', 'Website': 'https://rode.com' },
  { 'Category / Niche': 'Lighting Hardware', 'Brand Name': 'Elgato', 'Contact Email': 'sponsorships@elgato.com', 'Website': 'https://elgato.com' },
  { 'Category / Niche': 'Mechanical Keyboards', 'Brand Name': 'Keychron', 'Contact Email': 'marketing@keychron.com', 'Website': 'https://keychron.com' },
  { 'Category / Niche': 'Workspace Accessories', 'Brand Name': 'Grovemade', 'Contact Email': 'partners@grovemade.com', 'Website': 'https://grovemade.com' },
  { 'Category / Niche': 'Ergonomic Seating', 'Brand Name': 'Branch Furniture', 'Contact Email': 'press@branchfurniture.com', 'Website': 'https://branchfurniture.com' },
  { 'Category / Niche': 'Smart Notebooks', 'Brand Name': 'reMarkable', 'Contact Email': 'creators@remarkable.com', 'Website': 'https://remarkable.com' },
  { 'Category / Niche': 'Time Tracking', 'Brand Name': 'Rize', 'Contact Email': 'affiliates@rize.io', 'Website': 'https://rize.io' },
  { 'Category / Niche': 'Calendar App', 'Brand Name': 'Cron / Notion Calendar', 'Contact Email': 'partnerships@makenotion.com', 'Website': 'https://notion.so' },
  { 'Category / Niche': 'Project Management', 'Brand Name': 'Linear', 'Contact Email': 'community@linear.app', 'Website': 'https://linear.app' },
  { 'Category / Niche': 'API Testing', 'Brand Name': 'Hoppscotch', 'Contact Email': 'hello@hoppscotch.io', 'Website': 'https://hoppscotch.io' },
  { 'Category / Niche': 'Code Editor', 'Brand Name': 'Zed Industries', 'Contact Email': 'media@zed.dev', 'Website': 'https://zed.dev' },
  { 'Category / Niche': 'Terminal Tool', 'Brand Name': 'Warp', 'Contact Email': 'advocates@warp.dev', 'Website': 'https://warp.dev' },
  { 'Category / Niche': 'Documentation', 'Brand Name': 'Mintlify', 'Contact Email': 'growth@mintlify.com', 'Website': 'https://mintlify.com' },
  { 'Category / Niche': 'Analytics', 'Brand Name': 'Plausible Analytics', 'Contact Email': 'hello@plausible.io', 'Website': 'https://plausible.io' },
  { 'Category / Niche': 'Form Builder', 'Brand Name': 'Tally Forms', 'Contact Email': 'partners@tally.so', 'Website': 'https://tally.so' },
  { 'Category / Niche': 'Email Infrastructure', 'Brand Name': 'Resend', 'Contact Email': 'devrel@resend.com', 'Website': 'https://resend.com' },
  { 'Category / Niche': 'Authentication', 'Brand Name': 'Clerk', 'Contact Email': 'creators@clerk.com', 'Website': 'https://clerk.com' },
  { 'Category / Niche': 'Feature Flags', 'Brand Name': 'PostHog', 'Contact Email': 'sponsors@posthog.com', 'Website': 'https://posthog.com' },
  { 'Category / Niche': 'Search Engine', 'Brand Name': 'Kagi Search', 'Contact Email': 'press@kagi.com', 'Website': 'https://kagi.com' },
  { 'Category / Niche': 'Browser', 'Brand Name': 'Arc Browser', 'Contact Email': ' outreach@thebrowser.company', 'Website': 'https://arc.net' },
  { 'Category / Niche': 'Password Security', 'Brand Name': '1Password', 'Contact Email': 'campaigns@1password.com', 'Website': 'https://1password.com' },
  { 'Category / Niche': 'VPN & Mesh', 'Brand Name': 'Tailscale', 'Contact Email': 'community@tailscale.com', 'Website': 'https://tailscale.com' },
  { 'Category / Niche': 'Cloud Storage', 'Brand Name': 'Proton Drive', 'Contact Email': 'partnerships@proton.me', 'Website': 'https://proton.me' },
  { 'Category / Niche': 'Read Later', 'Brand Name': 'Readwise', 'Contact Email': 'hello@readwise.io', 'Website': 'https://readwise.io' },
  { 'Category / Niche': 'Podcast Hosting', 'Brand Name': 'Transistor FM', 'Contact Email': 'sponsors@transistor.fm', 'Website': 'https://transistor.fm' },
  { 'Category / Niche': 'Course Platform', 'Brand Name': 'Podia', 'Contact Email': 'collab@podia.com', 'Website': 'https://podia.com' },
  { 'Category / Niche': 'Digital Commerce', 'Brand Name': 'Lemon Squeezy', 'Contact Email': 'marketing@lemonsqueezy.com', 'Website': 'https://lemonsqueezy.com' },
  { 'Category / Niche': 'Design Prototyping', 'Brand Name': 'Spline 3D', 'Contact Email': 'hello@spline.design', 'Website': 'https://spline.design' },
  { 'Category / Niche': 'Icon Library', 'Brand Name': 'Nucleo Icons', 'Contact Email': 'info@nucleoapp.com', 'Website': 'https://nucleoapp.com' },
  { 'Category / Niche': 'UI Inspiration', 'Brand Name': 'Mobbin', 'Contact Email': 'partnerships@mobbin.com', 'Website': 'https://mobbin.com' },
  { 'Category / Niche': 'Font Foundry', 'Brand Name': 'Pangram Pangram', 'Contact Email': 'studio@pangrampangram.com', 'Website': 'https://pangrampangram.com' },
  { 'Category / Niche': 'Monitor Lightbars', 'Brand Name': 'BenQ Halo', 'Contact Email': 'pr@benq.com', 'Website': 'https://benq.com' },
  { 'Category / Niche': 'Desk Chargers', 'Brand Name': 'Anker Prime', 'Contact Email': 'influencers@anker.com', 'Website': 'https://anker.com' },
  { 'Category / Niche': 'Travel Backpacks', 'Brand Name': 'Peak Design', 'Contact Email': 'collabs@peakdesign.com', 'Website': 'https://peakdesign.com' },
  { 'Category / Niche': 'Minimalist Watches', 'Brand Name': 'Nordgreen', 'Contact Email': 'partners@nordgreen.com', 'Website': 'https://nordgreen.com' },
  { 'Category / Niche': 'Specialty Coffee', 'Brand Name': 'Fellow Products', 'Contact Email': 'marketing@fellowproducts.com', 'Website': 'https://fellowproducts.com' },
  { 'Category / Niche': 'Smart Hydration', 'Brand Name': 'LARQ Bottle', 'Contact Email': 'press@livelarq.com', 'Website': 'https://livelarq.com' },
  { 'Category / Niche': 'Standing Desks', 'Brand Name': 'Fully Jarvis', 'Contact Email': 'outreach@fully.com', 'Website': 'https://fully.com' },
  { 'Category / Niche': 'Acoustic Panels', 'Brand Name': 'GIK Acoustics', 'Contact Email': 'marketing@gikacoustics.com', 'Website': 'https://gikacoustics.com' },
  { 'Category / Niche': 'Camera Lenses', 'Brand Name': 'Sigma Imaging', 'Contact Email': 'creators@sigmaphoto.com', 'Website': 'https://sigmaphoto.com' },
];

export function generateSampleWorkbookAnalysis(): ImportAnalysisResult {
  const rows = SAMPLE_50_BRANDS_DATA.map((item) => ({
    'Category / Niche': item['Category / Niche'],
    'Brand Name': item['Brand Name'],
    'Contact Email': item['Contact Email'].trim(),
    Website: item.Website,
  }));

  const headers = ['Category / Niche', 'Brand Name', 'Contact Email', 'Website'];
  const sheet: ParsedSheetData = {
    sheetName: 'Brand Outreach Q4',
    headers,
    rows,
    detectedBrandCol: 'Brand Name',
    detectedEmailCol: 'Contact Email',
    confidence: 'high',
    emptyRowsCount: 2,
  };

  return buildAnalysisForSheet(
    '50_Brand_Outreach_Contacts.xlsx',
    [sheet],
    sheet.sheetName,
    'Brand Name',
    'Contact Email',
    'high'
  );
}

export function downloadSampleExcelFile(): void {
  const worksheet = XLSX.utils.json_to_sheet(SAMPLE_50_BRANDS_DATA);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Brand Outreach Q4');
  XLSX.writeFile(workbook, 'MailPilot_50_Brands_Sample.xlsx');
}
