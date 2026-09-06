import type { DefaultSession } from 'next-auth';

/**
 * Session/JWT augmentation for the fields the engine's ACL, impersonation and
 * header actually read.
 *
 * BOTH module identities are augmented on purpose. `next-auth/react`'s
 * `useSession()` types its result from '@auth/core/types', while the server-side
 * `auth()` types it from 'next-auth'. Augmenting only the latter left every
 * client component seeing the un-augmented `User` and failing on `.isAdmin` —
 * which kanoapp never hit, because there the two resolve to one identity through
 * its own node_modules. Declaring both is a superset and costs nothing.
 */
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      isAdmin: boolean;
      /**
       * Email of the real admin behind an impersonated session, else null.
       * Non-null is the single signal that "view as" is active — the UI keys
       * its banner off it. See server/impersonation.ts.
       */
      impersonatedBy?: string | null;
    } & DefaultSession['user'];
  }
  interface User {
    isAdmin?: boolean;
    impersonatedBy?: string | null;
  }
}

declare module '@auth/core/types' {
  interface Session {
    user: {
      id: string;
      isAdmin: boolean;
      impersonatedBy?: string | null;
    } & DefaultSession['user'];
  }
  interface User {
    isAdmin?: boolean;
    impersonatedBy?: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    isAdmin: boolean;
    /**
     * Present only while impersonating: the real admin's identity, parked here
     * so the session can be handed back and re-entry stays admin-gated.
     */
    realId?: string;
    realIsAdmin?: boolean;
    realEmail?: string | null;
  }
}
