import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";

type Role = "ADMIN" | "DESIGN_MANAGER" | "CATALOG_MANAGER" | "STAFF";

interface AuthResult {
  authorized: boolean;
  session: any;
  response?: NextResponse;
}

/**
 * Reusable auth guard for API routes.
 * - requireAuth()              → any logged-in user
 * - requireAuth("ADMIN")       → ADMIN only
 * - requireAuth(["ADMIN","CATALOG_MANAGER"]) → either role
 */
export async function requireAuth(
  allowedRoles?: Role | Role[]
): Promise<AuthResult> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return {
      authorized: false,
      session: null,
      response: NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      ),
    };
  }

  if (allowedRoles) {
    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    if (!roles.includes(session.user.role as Role)) {
      return {
        authorized: false,
        session,
        response: NextResponse.json(
          { success: false, error: "Insufficient permissions" },
          { status: 403 }
        ),
      };
    }
  }

  return { authorized: true, session };
}
