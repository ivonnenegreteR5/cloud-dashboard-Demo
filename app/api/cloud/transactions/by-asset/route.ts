import { NextResponse } from "next/server";

const BASE_URL =
  process.env.CLOUD_API_BASE_URL ||
  process.env.NEXT_PUBLIC_CLOUD_API_BASE_URL ||
  "https://cloudapi-prod-9metrcu7.uc.gateway.dev";

const API_KEY =
  process.env.CLOUD_API_API_KEY ||
  process.env.CLOUD_API_KEY ||
  "";

/**
 * Wrapper para el histórico por asset.
 * No afecta tu route de app/[tenant]/transactions/by-asset/route.ts
 * Solo habilita /api/cloud/transactions/by-asset para la pantalla de Activos.
 */
export async function GET(req: Request) {
  try {
    const headersIn = new Headers(req.headers);
    const sessionToken = headersIn.get("x-session-token");
    const authHeader = headersIn.get("authorization") || undefined;
    const tenantId = (headersIn.get("x-tenant-id") || "").trim();

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
    const assetId = (urlIn.searchParams.get("assetId") || "").trim();
    const limit = urlIn.searchParams.get("limit") ?? "200";

    if (!assetId) {
      return NextResponse.json(
        { ok: false, error: "Falta parámetro assetId" },
        { status: 400 }
      );
    }

    // ✅ Tu backend ya soporta /transactions global con sessionToken
    const urlOut = new URL(`${BASE_URL}/transactions`);
    urlOut.searchParams.set("sessionToken", sessionToken);
    urlOut.searchParams.set("assetId", assetId);
    urlOut.searchParams.set("limit", limit);

    // si tu backend usa tenantId opcional por query, lo mandamos
    if (tenantId) urlOut.searchParams.set("tenantId", tenantId);

    const cloudResp = await fetch(urlOut.toString(), {
      method: "GET",
      headers: {
        "x-api-key": API_KEY,
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      cache: "no-store",
    });

    const text = await cloudResp.text();
    let json: any = null;

    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error:
            text?.slice(0, 160) ||
            "Respuesta no válida de la API externa /transactions (no es JSON)",
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

    // normalizamos a { ok: true, items: [] }
    const items = Array.isArray(json)
      ? json
      : Array.isArray(json?.data)
      ? json.data
      : Array.isArray(json?.transactions)
      ? json.transactions
      : [];

    return NextResponse.json({ ok: true, items }, { status: 200 });
  } catch (err: any) {
    console.error("GET /api/cloud/transactions/by-asset error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Error interno leyendo histórico" },
      { status: 500 }
    );
  }
}
