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
      // Fallback cleanup so no accidental single-brace {placeholder} remains unresolved
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
 * Preserves literal '@' in the recipient address path so Android mailto intent resolvers and Thunderbird
 * populate the To, Subject, and Body fields accurately.
 */
export function buildEmailComposeUrl(
  emailApp: EmailAppType,
  email: PersonalizedEmail
): { url: string; method: 'mailto' | 'new_tab'; fallbackMailto: string } {
  const cleanRecipient = email.to.trim();
  const toQueryEncoded = encodeURIComponent(cleanRecipient);
  const subjectEncoded = encodeURIComponent(email.subject);
  // Normalize line breaks to CRLF per RFC 6068 so Android email intents (Thunderbird) preserve paragraphs
  const normalizedBody = email.body.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
  const bodyEncoded = encodeURIComponent(normalizedBody);

  // Standard RFC 6068 mailto URI for Android Intent.ACTION_SENDTO and desktop mail handlers
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

/**
 * Triggers the email intent (mailto: for Android / Thunderbird / system mail handlers, or web compose).
 * Note: Web browsers cannot force a specific native app to open; Android handles the mailto intent
 * via the user's default mail handler or displays the compatible email application chooser.
 */
export function launchEmailApplication(
  emailApp: EmailAppType,
  email: PersonalizedEmail
): LaunchEmailResult {
  const { url, method, fallbackMailto } = buildEmailComposeUrl(emailApp, email);

  try {
    const link = document.createElement('a');
    if (method === 'mailto') {
      link.href = url;
      // Trigger mailto intent at top frame so Android / OS intercepts the mailto: URI scheme cleanly
      link.target = '_top';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      return {
        success: true,
        usedMethod: 'mailto_link',
        message:
          'Triggered the standard mailto email intent with recipient, subject, and message pre-filled. Android will open your configured handler (such as Thunderbird) or show available email apps. Review and send the message inside your email app, then return here and click "Mark as Sent". If your email app did not open, use the Copy Recipient, Copy Subject, and Copy Message buttons below.',
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
        message: `Opened ${appLabel} compose window with recipient, subject, and personalized message pre-filled. Review and click Send inside ${appLabel}, then confirm below.`,
        composeUrl: url,
        fallbackMailto,
      };
    }
  } catch {
    return {
      success: false,
      usedMethod: 'fallback',
      message:
        'Could not automatically launch the email intent due to browser restrictions. Tap the direct mailto link or use the Copy Recipient, Copy Subject, and Copy Message buttons below.',
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
    label: 'Thunderbird / Android Email Intent (mailto)',
    shortLabel: 'Thunderbird / Mailto Intent',
    description:
      'Triggers the standard mailto intent so Android opens Thunderbird (or displays installed compatible email apps) with recipient, subject, and body pre-filled.',
  },
  {
    id: 'default_mailto',
    label: 'System Default Email Application (mailto)',
    shortLabel: 'Default Email App',
    description:
      'Launches your device default mail handler via a standard encoded mailto link.',
  },
  {
    id: 'compatible_mailto',
    label: 'Other Compatible Mail Apps (Mailto + Copy Fallback)',
    shortLabel: 'Compatible Mailto',
    description:
      'Universal RFC-6068 mailto link paired with separate Copy Recipient, Copy Subject, and Copy Message controls.',
  },
  {
    id: 'gmail',
    label: 'Gmail (Web Compose)',
    shortLabel: 'Gmail Web',
    description:
      'Opens Gmail web compose in a browser tab with recipient, subject, and body pre-filled.',
  },
  {
    id: 'outlook',
    label: 'Outlook (Web Compose)',
    shortLabel: 'Outlook Web',
    description:
      'Opens Outlook web compose in a browser tab with recipient, subject, and body pre-filled.',
  },
];
