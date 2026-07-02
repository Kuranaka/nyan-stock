export type EventName =
  | 'cta_click'
  | 'signup_submit'
  | 'faq_toggle'
  | 'external_link_click';

export function trackEvent(name: EventName, params: Record<string, string | number | boolean> = {}) {
  console.log('[analytics]', name, params);
}
