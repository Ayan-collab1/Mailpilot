import { Contact, EmailAppType, EmailTemplate } from '../types/mailpilot';

export interface PersonalizedEmail {
  to: string;
  brandName: string;
  subject: string;
  body: string;
}

/**
 * Replaces {brand_name} and {email} placeholders dynamically.
 * Guarantees no unresolved placeholders remain in subject or body.
 */
export function personalizeTemplate(
  template: Pick<EmailTemplate, 'subject' | 'body'>,
  contact: Pick<Contact, 'brandName' | 'email' | 'customSubject' | 'customBody'>
): PersonalizedEmail {
  const safeBrand = (contact.brandName || '').trim() || 'Partner';
  const safeEmail = (contact.email || '').trim();

  const rawSubject =
    contact.customSubject !== undefined ? contact.customSubject : template.subject;
  const rawBody =
    contact.customBody !== undefined ? contact.customBody : template.body;

  const replacePlaceholders = (text: string): string => {
    return text
      .replace(/\{\s*brand_name\s*\}/gi, safeBrand)
      .replace(/\{\s*brand\s*\}/gi, safeBrand)
      .replace(/\{\s*company_name\s*\}/gi, safeBrand)
      .replace(/\{\s*company\s*\}/gi, safeBrand)
      .replace(/\{\s*email\s*\}/gi, safeEmail)
      .replace(/\{\s*email_address\s*\}/gi, safeEmail)
      .replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => {
        const lower = key.toLowerCase();
        if (lower.includes('brand') || lower.includes('company')) return safeBrand;
        if (lower.includes('email') || lower.includes('mail')) return safeEmail;
        return safeBrand;
      });
  };

  return {
    to: safeEmail,
    brandName: safeBrand,
    subject: replacePlaceholders(rawSubject),
    body: replacePlaceholders(rawBody),
  };
}

export function isMobileEnvironment(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

/**
 * Builds a properly URL-encoded RFC 6068 mailto link for Android / Thunderbird / desktop mail handlers,
 * or web compose URLs when a web client is explicitly selected.
 */
export function buildEmailComposeUrl(
  emailApp: EmailAppType,
  email: PersonalizedEmail
): { url: string; method: 'mailto' | 'new_tab'; fallbackMailto: string } {
  const cleanRecipient = email.to.trim();
  const toQueryEncoded = encodeURIComponent(cleanRecipient);
  const subjectEncoded = encodeURIComponent(email.subject);
  const normalizedBody = email.body.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
  const bodyEncoded = encodeURIComponent(normalizedBody);

  const standardMailto = `mailto:${cleanRecipient}?subject=${subjectEncoded}&body=${bodyEncoded}`;

  switch (emailApp) {
    case 'thunderbird_mailto':
    case 'default_mailto':
    case 'compatible_mailto': {
      return {
        url: standardMailto,
        method: 'mailto',
        fallbackMailto: standardMailto,
      };
    }
    case 'gmail': {
      const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${toQueryEncoded}&su=${subjectEncoded}&body=${bodyEncoded}`;
      return {
        url: gmailUrl,
        method: 'new_tab',
        fallbackMailto: standardMailto,
      };
    }
    case 'outlook': {
      const outlookUrl = `https://outlook.office.com/mail/deeplink/compose?to=${toQueryEncoded}&subject=${subjectEncoded}&body=${bodyEncoded}`;
      return {
        url: outlookUrl,
        method: 'new_tab',
        fallbackMailto: standardMailto,
      };
    }
    default: {
      return {
        url: standardMailto,
        method: 'mailto',
        fallbackMailto: standardMailto,
      };
    }
  }
}

export interface LaunchEmailResult {
  success: boolean;
  usedMethod: 'mailto_link' | 'anchor_tab' | 'fallback';
  message: string;
  composeUrl: string;
  fallbackMailto: string;
}

export function launchEmailApplication(
  emailApp: EmailAppType,
  email: PersonalizedEmail
): LaunchEmailResult {
  const { url, method, fallbackMailto } = buildEmailComposeUrl(emailApp, email);

  try {
    const link = document.createElement('a');
    if (method === 'mailto') {
      link.href = url;
      link.target = '_top';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      return {
        success: true,
        usedMethod: 'mailto_link',
        message: 'Email intent opened. Confirm after sending.',
        composeUrl: url,
        fallbackMailto,
      };
    } else {
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      const appLabel = emailApp === 'gmail' ? 'Gmail' : 'Outlook';
      return {
        success: true,
        usedMethod: 'anchor_tab',
        message: `${appLabel} compose opened. Confirm after sending.`,
        composeUrl: url,
        fallbackMailto,
      };
    }
  } catch {
    return {
      success: false,
      usedMethod: 'fallback',
      message: 'Could not launch email app automatically. Use the direct link or copy buttons.',
      composeUrl: url,
      fallbackMailto,
    };
  }
}

export const EMAIL_APP_OPTIONS: {
  id: EmailAppType;
  label: string;
  shortLabel: string;
  description: string;
}[] = [
  {
    id: 'thunderbird_mailto',
    label: 'Thunderbird / Android Mailto',
    shortLabel: 'Thunderbird / Mailto',
    description: 'Standard mailto intent for Thunderbird & Android',
  },
  {
    id: 'default_mailto',
    label: 'Default Email App',
    shortLabel: 'Default Email App',
    description: 'System default mailto handler',
  },
  {
    id: 'compatible_mailto',
    label: 'Compatible Mailto',
    shortLabel: 'Compatible Mailto',
    description: 'Universal mailto with copy fallback',
  },
  {
    id: 'gmail',
    label: 'Gmail Web',
    shortLabel: 'Gmail Web',
    description: 'Browser compose tab',
  },
  {
    id: 'outlook',
    label: 'Outlook Web',
    shortLabel: 'Outlook Web',
    description: 'Browser compose tab',
  },
];
