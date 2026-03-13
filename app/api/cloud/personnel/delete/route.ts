// app/api/cloud/personnel/delete/route.ts
import { NextResponse } from "next/server";

const BASE_URL =
  process.env.NEXT_PUBLIC_CLOUD_API_BASE_URL ||
  process.env.CLOUD_API_BASE_URL ||
  "https://cloudapi-prod-9metrcu7.uc.gateway.dev";

const API_KEY =
  process.env.CLOUD_API_API_KEY ||
  process.env.CLOUD_API_KEY ||
  "";

export async function POST(req: Request) {
  try {
    const headers = new Headers(req.headers);
    const sessionToken = headers.get("x-session-token");
    const tenantId = headers.get("x-tenant-id");
    const authHeader = headers.get("authorization") || undefined;

    if (!tenantId) {
      return NextResponse.json({ ok: false, error: "Falta x-tenant-id" }, { status: 400 });
    }
    if (!sessionToken) {
      return NextResponse.json({ ok: false, error: "Falta x-session-token" }, { status: 401 });
    }

    const body = await req.json();
    const id = body?.id;

    if (!id) {
      return NextResponse.json({ ok: false, error: "Falta id del usuario a eliminar" }, { status: 400 });
    }

    // ✅ Tu backend (bulkDeletePersonnelPostHandler) requiere: items[]
    const cloudBody = {
      auth: { token: sessionToken },
      items: [{ id }],
    };

    // ✅ Endpoint correcto (batch delete)
    const cloudRes = await fetch(
      `${BASE_URL}/api/v1/${encodeURIComponent(String(tenantId))}/Personnel/Delete`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(API_KEY ? { "x-api-key": API_KEY } : {}),
          ...(authHeader ? { authorization: authHeader } : {}),
        },
        body: JSON.stringify(cloudBody),
      }
    );

    const text = await cloudRes.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    return NextResponse.json(data, { status: cloudRes.status });
  } catch (err: any) {
    console.error("Error /api/cloud/personnel/delete:", err);
    return NextResponse.json(
      { ok: false, error: err.message || "Error eliminando usuario" },
      { status: 500 }
    );
  }
}
