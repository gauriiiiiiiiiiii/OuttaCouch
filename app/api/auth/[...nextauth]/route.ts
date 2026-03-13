import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { normalizeContact } from "@/lib/normalizeContact";

const handler = NextAuth({
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        contact: { label: "Email or phone", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        const contact = normalizeContact(credentials?.contact);
        const password = credentials?.password || "";

        if (!contact || !password) {
          return null;
        }

        const user = await prisma.user.findFirst({
          where: {
            OR: [{ email: contact }, { phone: contact }]
          }
        });

        if (!user || user.isDeactivated) {
          return null;
        }

        const valid = await bcrypt.compare(password, user.passwordHash);

        if (!valid) {
          return null;
        }

        return {
          id: user.id,
          name: user.displayName ?? user.email ?? user.phone ?? "User",
          email: user.email ?? undefined,
          profileComplete: user.profileComplete,
          isDeactivated: user.isDeactivated
        };
      }
    })
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.profileComplete = (user as { profileComplete?: boolean })
          .profileComplete;
        token.isDeactivated = (user as { isDeactivated?: boolean }).isDeactivated;
      } else if (token.sub) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub },
          select: { profileComplete: true, isDeactivated: true }
        });
        if (dbUser) {
          token.profileComplete = dbUser.profileComplete;
          token.isDeactivated = dbUser.isDeactivated;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub || "";
        (session.user as { profileComplete?: boolean }).profileComplete =
          (token as { profileComplete?: boolean }).profileComplete ?? false;
        (session.user as { isDeactivated?: boolean }).isDeactivated =
          (token as { isDeactivated?: boolean }).isDeactivated ?? false;
      }
      return session;
    }
  }
});

export { handler as GET, handler as POST };
