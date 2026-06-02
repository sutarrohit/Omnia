import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization } from "better-auth/plugins";
import { prisma } from "./lib/prisma.js";
import env from "./env.js";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: [env.FRONTEND_URL],
  emailAndPassword: { enabled: true },
  // Let Prisma generate ids via @default(uuid()) on every model, instead of
  // better-auth supplying its own id format.
  advanced: { database: { generateId: false } },
  plugins: [organization()],
  databaseHooks: {
    // Every new user gets a personal organization so there's always a tenant.
    user: {
      create: {
        after: async (user) => {
          // id comes from @default(uuid()); createdAt has no DB default on these
          // generated models, so we still supply it.
          const org = await prisma.organization.create({
            data: {
              name: `${user.name || user.email}'s workspace`,
              slug: user.id,
              createdAt: new Date()
            }
          });
          await prisma.member.create({
            data: {
              organizationId: org.id,
              userId: user.id,
              role: "owner",
              createdAt: new Date()
            }
          });
        }
      }
    },
    // Default the active organization to the user's first membership on each new session.
    session: {
      create: {
        before: async (session) => {
          const member = await prisma.member.findFirst({
            where: { userId: session.userId }
          });
          return { data: { ...session, activeOrganizationId: member?.organizationId } };
        }
      }
    }
  }
});

export type Auth = typeof auth;
