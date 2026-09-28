import { queryClient } from '@/lib/query-client';
import { createRouter } from '@/routes/router';

import { AppProvider } from './provider';

const router = createRouter();

export function App() {
  return <AppProvider queryClient={queryClient} router={router} />;
}
