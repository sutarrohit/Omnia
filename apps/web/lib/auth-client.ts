import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";

// baseURL is the API server's origin; better-auth appends its /api/auth base path.
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_AUTH_URL ?? "http://localhost:4000",
  plugins: [organizationClient()]
});

export const { signIn, signUp, signOut, useSession } = authClient;
