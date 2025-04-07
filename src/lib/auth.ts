import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaClient, user as PrismaUser } from "@prisma/client";
import bcrypt from "bcrypt";

// Initialize Prisma Client
const prisma = new PrismaClient();

// Define the NextAuth options with TypeScript
export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Missing email or password");
        }

        const user: PrismaUser | null = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user) throw new Error("User not found");

        const isValid = await bcrypt.compare(credentials.password, user.password);
        if (!isValid) throw new Error("Invalid password");

        return {
          id: user.id,
          email: user.email,
          name: user.username, // Use `username` since you store it in the DB
        };
      },
    }),
  ],
  pages: {
    signIn: "/login",
    signOut: "/logout",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.name = user.name;
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user = {
          id: token.id as string, // Ensure token.id is treated as a string
          name: token.name as string,
          email: token.email as string,
        };
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
  },
};

// Create NextAuth handler
const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
