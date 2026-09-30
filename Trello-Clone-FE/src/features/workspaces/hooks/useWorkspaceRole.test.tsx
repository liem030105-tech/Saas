import { screen } from '@testing-library/react';
import { http as mswHttp, HttpResponse } from 'msw';

import { setAccessToken } from '@/api/token-store';
import { apiUrl } from '@/testing/data/api';
import { freshAccessToken } from '@/testing/data/auth';
import { acmeWorkspace, betaWorkspace, unknownWorkspaceId } from '@/testing/data/workspaces';
import { server } from '@/testing/mocks/server';
import { renderWithProviders } from '@/testing/render';

import { useWorkspaceRole } from './useWorkspaceRole';

function RoleProbe({ workspaceId }: { workspaceId: string }) {
  const role = useWorkspaceRole(workspaceId);
  return (
    <p>
      {workspaceId}: {role ?? 'none'}
    </p>
  );
}

describe('useWorkspaceRole', () => {
  beforeEach(() => {
    setAccessToken(freshAccessToken);
    server.use(
      mswHttp.get(apiUrl('/workspaces'), () =>
        HttpResponse.json({ data: [acmeWorkspace, betaWorkspace] }),
      ),
    );
  });
  afterEach(() => setAccessToken(null));

  it("returns the caller's role in that workspace", async () => {
    renderWithProviders(<RoleProbe workspaceId={betaWorkspace.id} />);

    expect(
      await screen.findByText(`${betaWorkspace.id}: ${betaWorkspace.role}`),
    ).toBeInTheDocument();
  });

  it('returns undefined for a workspace the caller is not in', async () => {
    renderWithProviders(
      <>
        <RoleProbe workspaceId={acmeWorkspace.id} />
        <RoleProbe workspaceId={unknownWorkspaceId} />
      </>,
    );

    // Once the list has loaded (acme resolves), the unknown workspace still has no role.
    await screen.findByText(`${acmeWorkspace.id}: ${acmeWorkspace.role}`);
    expect(screen.getByText(`${unknownWorkspaceId}: none`)).toBeInTheDocument();
  });
});
