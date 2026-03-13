// app/api/auth/session/route.ts
import { NextResponse } from "next/server";

const BASE_URL =
  process.env.CLOUD_API_BASE_URL ||
  process.env.NEXT_PUBLIC_CLOUD_API_BASE_URL ||
  "https://cloudapi-prod-9metrcu7.uc.gateway.dev";

// x-api-key del gateway (la misma que usas en REST)
const API_KEY =
  process.env.CLOUD_API_API_KEY ||
  process.env.CLOUD_API_KEY ||
  "";

// Firebase Web API key (Identity Toolkit)
const FIREBASE_WEB_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "";

async function signInWithPassword(email: string, password: string) {
  if (!FIREBASE_WEB_API_KEY) {
    throw new Error("Falta NEXT_PUBLIC_FIREBASE_API_KEY en .env");
  }

  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_WEB_API_KEY}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });

  const data = await resp.json().catch(() => ({})); 

  if (!resp.ok) {
    throw new Error(
      (data as any)?.error?.message ||
        `Error Firebase signInWithPassword (${resp.status})`
    );
  }

  const idToken = (data as any)?.idToken as string | undefined;
  if (!idToken) throw new Error("Firebase no devolvió idToken");

  return idToken;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = (body?.email as string | undefined)?.trim();
    const password = body?.password as string | undefined;

    // ✅ idToken opcional (si viene, lo usamos; si no, lo generamos aquí)
    const idTokenFromClient =
      (body?.idToken as string | undefined)?.trim() || "";

    if (!email || !password) {
      return NextResponse.json(
        { ok: false, error: "email y password requeridos" },
        { status: 400 }
      );
    }

    if (!API_KEY) {
      return NextResponse.json(
        { ok: false, error: "Falta CLOUD_API_API_KEY / CLOUD_API_KEY en .env" },
        { status: 500 }
      );
    }

    // ✅ Usa el del cliente si lo mandó; si no, lo generamos aquí como antes
    const idToken =
      idTokenFromClient || (await signInWithPassword(email, password));

    const cloudResp = await fetch(`${BASE_URL}/api/v1/SessionToken`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        email,
        password,
        apiKey: API_KEY,
      }),
    });

    const text = await cloudResp.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (!cloudResp.ok || data?.status !== 0) {
      return NextResponse.json(
        {
          ok: false,
          error: data?.message || data?.error || "Error creando SessionToken",
          raw: data,
        },
        { status: cloudResp.status || 500 }
      );
    }

    const sessionToken =
      data?.auth?.token || data?.token || data?.sessionToken || null;

    if (!sessionToken) {
      return NextResponse.json(
        { ok: false, error: "La API no devolvió auth.token", raw: data },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        sessionToken,
        idToken, // ✅ siempre devolvemos el idToken que realmente usamos
        user: {
          uid: data.uid ?? null,
          email: data.email ?? email,
          tenantId: data.tenantId ?? "demo",
          role: data.role ?? null,
          locationId: data.locationId ?? null,
          personnelId: data.personnelId ?? null,
          active: data.active ?? null,
        },
        tenantId: data.tenantId ?? "demo",
        expiresAt: data.expiresAt ?? null,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("POST /api/auth/session error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Error creando SessionToken" },
      { status: 500 }
    );
  }
}
