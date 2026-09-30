/** The URL of a workspace (docs/architecture/frontend.md → Routes). */
export const workspacePath = (slug: string) => `/w/${slug}`;
export const workspaceSettingsPath = (slug: string) => `/w/${slug}/settings`;
export const workspaceMembersPath = (slug: string) => `/w/${slug}/members`;
