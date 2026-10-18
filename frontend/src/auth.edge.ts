import NextAuth from "next-auth"

/**
 * Edge-safe Auth.js instance for the middleware.
 *
 * The full `@/auth` pulls in Prisma (and the node-postgres driver), which
 * cannot run in the Edge runtime the middleware uses. The middleware only
 * needs to read the JWT, so this instance has no providers and no adapter;
 * the callbacks mirror `auth.config.ts` so `req.auth.user.role` is populated.
 */
export const { auth } = NextAuth({
  providers: [],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string
        token.role = user.role
        token.organizationId = user.organizationId
      }
      return token
    },
    session({ session, token }) {
      session.user.id = token.id
      session.user.role = token.role
      session.user.organizationId = token.organizationId
      return session
    },
  },
})
