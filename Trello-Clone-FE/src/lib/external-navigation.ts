// Leaving the app for another site (Stripe Checkout and Customer Portal, BILLING-001). Tests swap
// it (setExternalNavigation) to see where the app would go, since jsdom cannot navigate.

const browserNavigation = (url: string) => window.location.assign(url);

let navigation = browserNavigation;

/** Sends the browser to `url`. */
export const leaveTo = (url: string) => navigation(url);

/** Tests replace the navigation (and back with `null`). */
export function setExternalNavigation(next: ((url: string) => void) | null) {
  navigation = next ?? browserNavigation;
}
