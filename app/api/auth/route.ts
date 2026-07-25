import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import {
  SESSION_COOKIE,
  createSessionToken,
  getAuthContext,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { loginSchema } from "@/lib/validation/schemas";
import { audit, clientIp } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 },
    );
  }

  const { email, password } = parsed.data;
  const ip = clientIp(req);

  const user = await db.getUserByEmail(email);
  // Same generic message and comparable work either way, so the response does
  // not reveal whether an account exists.
  const passwordOk = user
    ? await verifyPassword(password, user.passwordHash)
    : await verifyPassword(password, "scrypt$16384$8$1$AAAA$AAAA");

  if (!user || !passwordOk) {
    if (user) {
      const memberships = await db.listMembershipsByUser(user.id);
      if (memberships[0]) {
        await audit({
          orgId: memberships[0].orgId,
          userId: user.id,
          actorEmail: user.email,
          action: "user.login_failed",
          ip,
        });
      }
    }
    return NextResponse.json(
      { error: "Incorrect email or password" },
      { status: 401 },
    );
  }

  const memberships = await db.listMembershipsByUser(user.id);
  const membership = memberships[0];
  if (!membership) {
    return NextResponse.json(
      { error: "This account is not a member of any organization" },
      { status: 403 },
    );
  }

  await audit({
    orgId: membership.orgId,
    userId: user.id,
    actorEmail: user.email,
    action: "user.login",
    ip,
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(
    SESSION_COOKIE,
    createSessionToken(user.id, membership.orgId),
    sessionCookieOptions(),
  );
  return res;
}

export async function DELETE(req: NextRequest) {
  const auth = await getAuthContext();
  if (auth) {
    await audit({
      orgId: auth.org.id,
      userId: auth.user.id,
      actorEmail: auth.user.email,
      action: "user.logout",
      ip: clientIp(req),
    });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return res;
}
