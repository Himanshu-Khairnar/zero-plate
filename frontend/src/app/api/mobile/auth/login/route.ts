import bcrypt from "bcryptjs";

import { ApiError, readJson, requireString } from "@/lib/api";
import { findLoginUser, issueToken, mobileRoute, preflight, profile } from "@/lib/mobile-auth";
import { listOutlets } from "@/lib/outlets";

/** POST /api/mobile/auth/login { email, password } → { token, user, outlets } */
export const POST = mobileRoute(async (req: Request) => {
  const body = await readJson<{ email?: unknown; password?: unknown }>(req);
  const email = requireString(body.email, "email");
  if (typeof body.password !== "string" || body.password === "") throw new ApiError("password is required.");

  // Same check as the Auth.js credentials provider (src/auth.config.ts).
  const found = await findLoginUser(email);
  if (!found?.passwordHash || !(await bcrypt.compare(body.password, found.passwordHash))) {
    throw new ApiError("Invalid email or password.", 401);
  }
  const outlets = await listOutlets(found.session.viewer);
  return Response.json({ token: issueToken(found.session.viewer), ...profile(found.session, outlets) });
});

export const OPTIONS = preflight;
