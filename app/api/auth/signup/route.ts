import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { createAccount } from "@/lib/auth/provision";
import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { signupSchema } from "@/lib/validation/schemas";
import { audit, clientIp } from "@/lib/audit";
import { createLogger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createLogger("api:signup");

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { email, password, name, organizationName } = parsed.data;

  try {
    if (await db.getUserByEmail(email)) {
      return NextResponse.json(
        { error: "An account with that email already exists" },
        { status: 409 },
      );
    }

    const { user, org } = await createAccount({
      email,
      password,
      name,
      organizationName,
    });

    const ip = clientIp(req);
    await audit({
      orgId: org.id,
      userId: user.id,
      actorEmail: user.email,
      action: "org.created",
      targetType: "org",
      targetId: org.id,
      metadata: { slug: org.slug },
      ip,
    });
    await audit({
      orgId: org.id,
      userId: user.id,
      actorEmail: user.email,
      action: "user.signup",
      ip,
    });

    const res = NextResponse.json({ ok: true }, { status: 201 });
    res.cookies.set(
      SESSION_COOKIE,
      createSessionToken(user.id, org.id),
      sessionCookieOptions(),
    );
    return res;
  } catch (err) {
    log.error("Signup failed", err);
    return NextResponse.json(
      { error: "Could not create the account" },
      { status: 500 },
    );
  }
}
