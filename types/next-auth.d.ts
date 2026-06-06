import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      profileComplete?: boolean;
      isDeactivated?: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    profileComplete?: boolean;
    isDeactivated?: boolean;
  }
}
