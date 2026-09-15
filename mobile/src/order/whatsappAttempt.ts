import type { WhatsAppClientMode } from '../api/orders';

const PENDING_ATTEMPT_KEY = 'sapako.pending-whatsapp-attempt';

export interface WhatsAppAttempt {
  orderId: string;
  attemptId: string;
  clientMode: WhatsAppClientMode;
}

function getClientMode(): WhatsAppClientMode {
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const isStandalone =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true);

  if (/iPad|iPhone|iPod/.test(userAgent)) {
    return isStandalone ? 'ios-pwa' : 'ios-browser';
  }
  if (/Android/.test(userAgent)) return 'android-browser';
  return 'other-browser';
}

function createAttemptId(): string {
  return `wa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function beginWhatsAppAttempt(orderId: string): WhatsAppAttempt {
  const attempt: WhatsAppAttempt = {
    orderId,
    attemptId: createAttemptId(),
    clientMode: getClientMode(),
  };
  try {
    sessionStorage.setItem(PENDING_ATTEMPT_KEY, JSON.stringify(attempt));
  } catch {
    // The audit trail remains useful even if private browsing disables storage.
  }
  return attempt;
}

export function takePendingWhatsAppAttempt(): WhatsAppAttempt | null {
  try {
    const saved = sessionStorage.getItem(PENDING_ATTEMPT_KEY);
    sessionStorage.removeItem(PENDING_ATTEMPT_KEY);
    if (!saved) return null;
    const attempt = JSON.parse(saved) as Partial<WhatsAppAttempt>;
    if (
      typeof attempt.orderId !== 'string' ||
      typeof attempt.attemptId !== 'string' ||
      !['ios-pwa', 'ios-browser', 'android-browser', 'other-browser'].includes(
        attempt.clientMode ?? '',
      )
    ) {
      return null;
    }
    return attempt as WhatsAppAttempt;
  } catch {
    return null;
  }
}
