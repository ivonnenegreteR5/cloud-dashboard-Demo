import { NextResponse } from "next/server";

const BASE_URL =
  process.env.CLOUD_API_BASE_URL ||
  process.env.NEXT_PUBLIC_CLOUD_API_BASE_URL ||
  "https://cloudapi-prod-9metrcu7.uc.gateway.dev";

const API_KEY =
  process.env.CLOUD_API_API_KEY ||
  process.env.CLOUD_API_KEY ||
  "";

export async function GET(req: Request) {
  try {
    const headersIn = new Headers(req.headers);

    const sessionToken = headersIn.get("x-session-token");
    const authHeader = headersIn.get("authorization") || undefined;
    const tenantId = headersIn.get("x-tenant-id") || undefined;

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
          error: "Falta CLOUD_API_API_KEY o CLOUD_API_KEY en variables de entorno",
        },
        { status: 500 }
      );
    }

    const urlIn = new URL(req.url);
    const assetId = urlIn.searchParams.get("assetId");
    const limit = urlIn.searchParams.get("limit") ?? "200";

    if (!assetId || !assetId.trim()) {
      return NextResponse.json(
        { ok: false, error: "Falta parámetro assetId" },
        { status: 400 }
      );
    }

    // ✅ Usa el endpoint REAL que existe en tu server: /transactions
    const urlOut = new URL(`${BASE_URL}/transactions`);
    urlOut.searchParams.set("sessionToken", sessionToken);
    urlOut.searchParams.set("assetId", assetId.trim());
    urlOut.searchParams.set("limit", limit);

    // opcional: pasar tenantId (tu server lo puede inferir del sessionToken,
    // pero no estorba y ayuda si tu getTenantIdFromRequest lo soporta)
    if (tenantId && tenantId.trim()) {
      urlOut.searchParams.set("tenantId", tenantId.trim());
    }

    const cloudResp = await fetch(urlOut.toString(), {
      method: "GET",
      headers: {
        "x-api-key": API_KEY,
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      cache: "no-store",
    });

    const text = await cloudResp.text();
    let json: any;

    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error:
            text?.slice(0, 160) ||
            "Respuesta no válida de la API /transactions (no es JSON)",
        },
        { status: cloudResp.status || 500 }
      );
    }

    if (!cloudResp.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: json?.message || "Error de la API externa",
          raw: json,
        },
        { status: cloudResp.status }
      );
    }

    // ✅ tu server responde un arreglo directo: res.json(rows)
    const items = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];

    return NextResponse.json({ ok: true, items });
  } catch (err: any) {
    console.error("GET /api/cloud/transactions/by-asset error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Error interno leyendo histórico" },
      { status: 500 }
    );
  }
}
