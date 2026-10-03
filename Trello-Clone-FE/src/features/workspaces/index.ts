// Public API of the workspaces feature: other code imports from '@/features/workspaces' only.
export { AcceptInvite } from './components/AcceptInvite';
export { FirstWorkspace } from './components/FirstWorkspace';
export { MembersList } from './components/MembersList';
export { WorkspaceGate } from './components/WorkspaceGate';
export { WorkspaceNav } from './components/WorkspaceNav';
export { UpgradePrompt } from './components/UpgradePrompt';
export { WorkspaceSettings } from './components/WorkspaceSettings';
export { useWorkspaceRole } from './hooks/useWorkspaceRole';
export { can, type WorkspaceAction } from './permissions';
export {
  workspaceBillingPath,
  workspaceMembersPath,
  workspacePath,
  workspaceSettingsPath,
} from './paths';
export { useMembers, useWorkspaceBySlug, useWorkspaces, workspaceKeys } from './queries';
