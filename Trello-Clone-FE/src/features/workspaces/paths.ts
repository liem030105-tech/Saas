/** The URL of a workspace (docs/architecture/frontend.md → Routes). */
export const workspacePath = (slug: string) => `/w/${slug}`;
export const workspaceSettingsPath = (slug: string) => `/w/${slug}/settings`;
export const workspaceMembersPath = (slug: string) => `/w/${slug}/members`;
/** The settings page's "Plan and billing" section (BILLING-001), where the OWNER upgrades. */
export const workspaceBillingPath = (slug: string) => `/w/${slug}/settings#billing`;
