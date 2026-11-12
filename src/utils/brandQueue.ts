import {
  BrandGroup,
  BrandStatus,
  Contact,
  ContactStatus,
} from '../types/mailpilot';
import { isValidEmailAddress } from './excelParser';

/**
 * Maps internal ContactStatus to concise UI status label.
 */
export function formatRecipientStatusLabel(status: ContactStatus): string {
  switch (status) {
    case 'Marked as Sent':
      return 'Sent';
    case 'Prepared':
      return 'Ready';
    case 'Pending':
      return 'Pending';
    case 'Skipped':
      return 'Skipped';
    case 'Invalid':
      return 'Invalid';
    default:
      return status;
  }
}

/**
 * Computes the overall BrandStatus based on its recipients' individual statuses.
 *
 * Rules:
 * - A brand is COMPLETED only when all its valid recipients have been marked as SENT
 *   (and no valid recipients were skipped).
 * - If any recipient is skipped, the brand is marked as NEEDS ATTENTION.
 * - If all recipients are invalid, the brand is marked as INVALID.
 * - If at least one recipient is sent or prepared and pending recipients remain, IN PROGRESS.
 */
export function computeBrandStatus(recipients: Contact[]): {
  totalEmailsFound: number;
  validEmailCount: number;
  invalidEmailCount: number;
  emailsSent: number;
  emailsSkipped: number;
  emailsPrepared: number;
  emailsRemaining: number;
  status: BrandStatus;
} {
  const totalEmailsFound = recipients.length;
  let validEmailCount = 0;
  let invalidEmailCount = 0;
  let emailsSent = 0;
  let emailsSkipped = 0;
  let emailsPrepared = 0;
  let emailsRemaining = 0;

  for (const r of recipients) {
    const isInvalid =
      r.status === 'Invalid' ||
      r.validationFlags?.invalidEmail ||
      !isValidEmailAddress(r.email);

    if (isInvalid) {
      invalidEmailCount++;
      continue;
    }

    validEmailCount++;

    if (r.status === 'Marked as Sent') {
      emailsSent++;
    } else if (r.status === 'Skipped') {
      emailsSkipped++;
    } else if (r.status === 'Prepared') {
      emailsPrepared++;
      if (!r.excluded) {
        emailsRemaining++;
      }
    } else {
      // Pending
      if (!r.excluded) {
        emailsRemaining++;
      }
    }
  }

  let status: BrandStatus = 'Pending';

  if (totalEmailsFound === 0 || validEmailCount === 0) {
    status = 'Invalid';
  } else if (emailsSkipped > 0) {
    status = 'Needs Attention';
  } else if (emailsSent === validEmailCount && validEmailCount > 0) {
    status = 'Completed';
  } else if (emailsSent > 0 || emailsPrepared > 0) {
    status = 'In Progress';
  } else {
    status = 'Pending';
  }

  return {
    totalEmailsFound,
    validEmailCount,
    invalidEmailCount,
    emailsSent,
    emailsSkipped,
    emailsPrepared,
    emailsRemaining,
    status,
  };
}

/**
 * Groups flat contacts into an ordered hierarchical BrandGroup queue.
 * Preserves brand order and never merges distinct brand rows that merely share an email.
 */
export function buildBrandGroups(contacts: Contact[]): BrandGroup[] {
  const groupsMap = new Map<string, Contact[]>();
  const brandOrder: string[] = [];

  for (const contact of contacts) {
    const key =
      contact.brandId && contact.brandId.trim().length > 0
        ? contact.brandId
        : `legacy_brand_${(contact.brandName || 'unnamed').trim().toLowerCase()}`;

    if (!groupsMap.has(key)) {
      groupsMap.set(key, []);
      brandOrder.push(key);
    }
    groupsMap.get(key)!.push(contact);
  }

  return brandOrder.map((brandId) => {
    const recipients = groupsMap.get(brandId) || [];
    const first = recipients[0];
    const metrics = computeBrandStatus(recipients);
    const allExcluded = recipients.every((r) => r.excluded);

    let latestProcessed: string | undefined;
    for (const r of recipients) {
      if (
        r.lastProcessedAt &&
        (!latestProcessed || r.lastProcessedAt > latestProcessed)
      ) {
        latestProcessed = r.lastProcessedAt;
      }
    }

    return {
      brandId,
      brandName: first?.brandName || 'Unnamed Brand',
      recipients: recipients.map((r, idx) => ({
        ...r,
        brandId,
        recipientIndex: idx + 1,
        totalBrandRecipients: recipients.length,
      })),
      totalEmailsFound: metrics.totalEmailsFound,
      validEmailCount: metrics.validEmailCount,
      invalidEmailCount: metrics.invalidEmailCount,
      emailsSent: metrics.emailsSent,
      emailsSkipped: metrics.emailsSkipped,
      emailsPrepared: metrics.emailsPrepared,
      emailsRemaining: metrics.emailsRemaining,
      status: metrics.status,
      excluded: allExcluded,
      phone: first?.phone,
      websiteNotes: first?.websiteNotes,
      sourceList: first?.sourceList,
      sourceFile: first?.sourceFile,
      sheetName: first?.sheetName,
      importedAt: first?.importedAt || new Date().toISOString(),
      lastProcessedAt: latestProcessed,
    };
  });
}

/**
 * Returns eligible brands for the active batch queue (brands that have at least one non-excluded recipient).
 */
export function getQueueBrandGroups(contacts: Contact[]): BrandGroup[] {
  const allBrands = buildBrandGroups(contacts);
  return allBrands.filter((b) => !b.excluded && b.recipients.some((r) => !r.excluded));
}

/**
 * Finds the first pending/prepared valid recipient inside a BrandGroup,
 * or falls back to the first valid recipient, or first recipient.
 */
export function getPreferredRecipientForBrand(brand: BrandGroup): Contact | null {
  if (brand.recipients.length === 0) return null;

  // 1. First pending or prepared valid non-excluded recipient
  const nextPending = brand.recipients.find(
    (r) =>
      !r.excluded &&
      (r.status === 'Pending' || r.status === 'Prepared') &&
      !r.validationFlags.invalidEmail &&
      isValidEmailAddress(r.email)
  );
  if (nextPending) return nextPending;

  // 2. First skipped valid non-excluded recipient (when reviewing a Needs Attention brand)
  const firstSkipped = brand.recipients.find(
    (r) =>
      !r.excluded &&
      r.status === 'Skipped' &&
      !r.validationFlags.invalidEmail
  );
  if (firstSkipped) return firstSkipped;

  // 3. First non-excluded recipient
  const firstIncluded = brand.recipients.find((r) => !r.excluded);
  return firstIncluded || brand.recipients[0];
}
