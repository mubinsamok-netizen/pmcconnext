import { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { getAppRole } from "@/lib/roles";
import { findAllMaster, findAllMasterRaw, insertMaster, updateMaster } from "@/lib/sheetsCrud";
import { ensureMasterSchema } from "@/lib/sheetsSetup";
import { isSupabaseBackend } from "@/lib/supabaseRest";
import { getSupabaseTeamMemberCredentials } from "@/lib/supabaseReadModel";

const COMPANY_DOMAIN = "pichayamongkolconstruction.com";

type TeamRecord = Record<string, string | number | undefined>;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Failed to authenticate";
}

function normalizeEmail(email?: string | null) {
  return (email || "").trim().toLowerCase();
}

function isCompanyEmail(email?: string | null) {
  return normalizeEmail(email).endsWith(`@${COMPANY_DOMAIN}`);
}

function getGoogleProfileValue(profile: unknown, key: string) {
  if (!profile || typeof profile !== "object") return "";
  const value = (profile as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function createMemberId() {
  return `M-G-${Date.now().toString().slice(-8)}`;
}

async function updateLoginStamp(user: TeamRecord, patch: Record<string, string>) {
  if (!user._rowIndex) return;
  await updateMaster(
    "Team",
    isSupabaseBackend() ? String(user.member_id || user._rowIndex) : user._rowIndex,
    {
      ...patch,
      ...(user.member_id ? { member_id: String(user.member_id) } : {}),
      last_login_at: new Date().toISOString(),
    },
    user._rowIndex
  );
}

async function getTeamUserByEmail(email: string) {
  if (!isSupabaseBackend()) await ensureMasterSchema();
  const users = await findAllMaster("Team") as TeamRecord[];
  return users.find((user) => normalizeEmail(String(user.email || "")) === normalizeEmail(email));
}

async function getCredentialsTeamUserByEmail(email: string) {
  if (isSupabaseBackend()) {
    const users = await getSupabaseTeamMemberCredentials() as TeamRecord[];
    return users.find((user) => normalizeEmail(String(user.email || "")) === normalizeEmail(email));
  }

  await ensureMasterSchema();
  const users = await findAllMasterRaw("Team") as TeamRecord[];
  return users.find((user) => normalizeEmail(String(user.email || "")) === normalizeEmail(email));
}

async function upsertGoogleTeamUser({
  email,
  name,
  googleSub,
  avatarUrl,
}: {
  email: string;
  name: string;
  googleSub: string;
  avatarUrl: string;
}) {
  if (!isSupabaseBackend()) await ensureMasterSchema();
  const users = await findAllMaster("Team") as TeamRecord[];
  const normalizedEmail = normalizeEmail(email);
  const existing = users.find((user) => (
    String(user.google_sub || "") === googleSub ||
    normalizeEmail(String(user.email || "")) === normalizedEmail
  ));

  if (existing) {
    if (existing.active === "FALSE") {
      throw new Error("บัญชีนี้ถูกปิดการใช้งาน กรุณาติดต่อ Admin");
    }

    await updateLoginStamp(existing, {
      email: normalizedEmail,
      name: String(existing.name || name || normalizedEmail),
      google_sub: googleSub,
      avatar_url: avatarUrl,
      auth_provider: "google",
    });

    return {
      ...existing,
      email: normalizedEmail,
      name: String(existing.name || name || normalizedEmail),
      google_sub: googleSub,
      avatar_url: avatarUrl,
      auth_provider: "google",
    };
  }

  if (!isCompanyEmail(email)) {
    throw new Error("Google sign-in is only available to invited users or company email accounts.");
  }

  const member = {
    member_id: createMemberId(),
    name: name || normalizedEmail,
    role: "Staff",
    email: normalizedEmail,
    password: "",
    phone: "",
    project_ids: "",
    active: "TRUE",
    google_sub: googleSub,
    avatar_url: avatarUrl,
    auth_provider: "google",
    last_login_at: new Date().toISOString(),
  };

  await insertMaster("Team", member);
  return member;
}

function toSessionUser(user: TeamRecord) {
  return {
    id: String(user.member_id || user.email || ""),
    name: String(user.name || user.email || ""),
    email: String(user.email || ""),
    image: String(user.avatar_url || ""),
    role: getAppRole(String(user.role || "Staff")),
    googleSub: String(user.google_sub || ""),
    authProvider: String(user.auth_provider || "credentials"),
  };
}

export const authOptions: AuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      authorization: {
        params: {
          scope: "openid email profile",
        },
      },
    }),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Missing email or password");
        }

        try {
          const user = await getCredentialsTeamUserByEmail(credentials.email);

          if (!user) {
            throw new Error("User not found");
          }

          if (user.active === "FALSE") {
            throw new Error("บัญชีนี้ถูกปิดการใช้งาน กรุณาติดต่อ Admin");
          }

          const passwordOk = user.password === credentials.password;

          if (!passwordOk) {
            throw new Error("Invalid password");
          }

          await updateLoginStamp(user, { auth_provider: String(user.auth_provider || "credentials") });
          return toSessionUser(user) as never;
        } catch (error: unknown) {
          console.error("Auth error:", error);
          throw new Error(getErrorMessage(error));
        }
      },
    }),
  ],
  pages: {
    signIn: "/",
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google") return true;

      const email = normalizeEmail(user.email || getGoogleProfileValue(profile, "email"));
      const googleSub = account.providerAccountId || getGoogleProfileValue(profile, "sub");
      const emailVerified = (profile as { email_verified?: boolean } | undefined)?.email_verified;

      if (!email || !googleSub || emailVerified === false) {
        console.warn("Google sign-in rejected", {
          hasEmail: Boolean(email),
          hasGoogleSub: Boolean(googleSub),
          emailDomain: email.includes("@") ? email.split("@").pop() : "",
          emailVerified,
          expectedDomain: COMPANY_DOMAIN,
        });
        return false;
      }

      try {
        const teamUser = await upsertGoogleTeamUser({
          email,
          name: user.name || getGoogleProfileValue(profile, "name") || email,
          googleSub,
          avatarUrl: user.image || getGoogleProfileValue(profile, "picture") || "",
        });
        const sessionUser = toSessionUser(teamUser);
        Object.assign(user, sessionUser);
        return true;
      } catch (error) {
        console.error("Google sign-in error:", error);
        return false;
      }
    },
    async jwt({ token, user, account }) {
      if (user) {
        token.userId = (user as { id?: string }).id || token.sub || "";
        token.role = getAppRole((user as { role?: string }).role || String(token.role || "Staff"));
        token.googleSub = (user as { googleSub?: string }).googleSub || token.googleSub || "";
        token.authProvider = (user as { authProvider?: string }).authProvider || account?.provider || token.authProvider || "credentials";
      }

      if (account?.provider === "google" && token.email) {
        const teamUser = await getTeamUserByEmail(String(token.email));
        if (teamUser) {
          token.userId = String(teamUser.member_id || token.userId || "");
          token.role = getAppRole(String(teamUser.role || "Staff"));
          token.googleSub = String(teamUser.google_sub || token.googleSub || "");
          token.picture = String(teamUser.avatar_url || token.picture || "");
          token.authProvider = "google";
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.userId || token.sub || "");
        session.user.role = getAppRole(String(token.role || "Staff"));
        session.user.googleSub = String(token.googleSub || "");
        session.user.authProvider = String(token.authProvider || "credentials");
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET || "dev-fallback-secret-change-in-production",
  session: {
    strategy: "jwt",
  },
};
