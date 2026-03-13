// app/api/cloud/assets/delete/route.ts
import { NextResponse } from "next/server";

const BASE_URL =
  process.env.CLOUD_API_BASE_URL ||
  process.env.NEXT_PUBLIC_CLOUD_API_BASE_URL ||
  "https://cloudapi-prod-9metrcu7.uc.gateway.dev";

// ✅ acepta cualquiera de las dos (para no romper lo ya funcional)
const API_KEY = process.env.CLOUD_API_API_KEY || process.env.CLOUD_API_KEY || "";

export async function POST(req: Request) {
  try {
    const headers = new Headers(req.headers);

    const sessionToken = headers.get("x-session-token");
    const authHeader = headers.get("authorization") || undefined;

    // ✅ tenant (viene desde tu pantalla como x-tenant-id)
    const tenantIdRaw = headers.get("x-tenant-id") || "";
    const tenantId = tenantIdRaw.trim();

    if (!sessionToken) {
      return NextResponse.json(
        { ok: false, error: "Falta x-session-token" },
        { status: 401 }
      );
    }

    if (!API_KEY) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Falta CLOUD_API_API_KEY o CLOUD_API_KEY en variables de entorno (.env.local)",
        },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const ids = (body?.ids || []) as string[];

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { ok: false, error: "ids[] requerido" },
        { status: 400 }
      );
    }

    // 🟣 Body como tu REST
    const cloudBody = {
      auth: { token: sessionToken },
      items: ids.map((id) => ({ _id: String(id) })),
    };

    // ✅ Preferimos endpoint por tenant. Si no viene tenant, usamos el global por compatibilidad.
    const endpoint = tenantId
      ? `${BASE_URL}/api/v1/${encodeURIComponent(tenantId)}/Assets/Delete`
      : `${BASE_URL}/api/v1/Assets/Delete`;

    const cloudResp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify(cloudBody),
    });

    const text = await cloudResp.text();
    let json: any = null;

    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // Si no es JSON:
      if (!cloudResp.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: "Error de la API externa",
            status: cloudResp.status,
            endpoint,
            raw: text || null,
          },
          { status: cloudResp.status }
        );
      }

      return NextResponse.json(
        { ok: true, result: text, endpoint },
        { status: 200 }
      );
    }

    if (!cloudResp.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: json?.message || json?.error || "Error de la API externa",
          status: cloudResp.status,
          endpoint,
          raw: json,
        },
        { status: cloudResp.status }
      );
    }

    return NextResponse.json({ ok: true, result: json, endpoint }, { status: 200 });
  } catch (err: any) {
    console.error("POST /api/cloud/assets/delete error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Error interno borrando assets" },
      { status: 500 }
    );
  }
}
