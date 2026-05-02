import { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { findAll } from "@/lib/sheetsCrud";

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Missing email or password");
        }

        try {
          const users = await findAll("Team");
          const user = users.find(u => u.email === credentials.email);
          
          if (!user) {
            throw new Error("User not found");
          }

          if (user.password !== credentials.password) {
            throw new Error("Invalid password");
          }

          return {
            id: user.member_id || user.email,
            name: user.name,
            email: user.email,
            image: user.role,
          };
        } catch (error: any) {
          console.error("Auth error:", error);
          throw new Error(error.message || "Failed to authenticate");
        }
      }
    }),
  ],
  pages: {
    signIn: "/",
  },
  callbacks: {
    async session({ session, token }) {
      if (session.user) {
        // @ts-ignore
        session.user.id = token.sub;
        // @ts-ignore
        session.user.role = token.picture;
      }
      return session;
    },
  },
  session: {
    strategy: "jwt",
  },
};
