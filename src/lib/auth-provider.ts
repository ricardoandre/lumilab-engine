import type { AuthProvider } from '@refinedev/core';
import { getSession, signOut } from 'next-auth/react';
import { clearPermissionsCache } from './use-permissions';

export const authProvider: AuthProvider = {
  login: async () => ({ success: true }), // sign-in itself happens on the custom /login page
  logout: async () => {
    clearPermissionsCache(); // drop this user's perms so the next login refetches
    await signOut({ redirect: false });
    return { success: true, redirectTo: '/login' };
  },
  check: async () => {
    const session = await getSession();
    if (session) return { authenticated: true };
    return { authenticated: false, redirectTo: '/login' };
  },
  onError: async (error) => ({ error }),
  getIdentity: async () => {
    const session = await getSession();
    if (!session?.user) return null;
    return {
      id: session.user.id,
      name: session.user.name ?? session.user.email,
      email: session.user.email,
    };
  },
};
