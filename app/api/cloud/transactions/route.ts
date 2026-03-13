// app/api/cloud/transactions/route.ts
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
 * GET /api/cloud/transactions
 *
 * Soporta:
 * - limit (default 500)
 * - assetId (opcional)
 * - tag (opcional)  -> EPC/RFID
 *
 * ✅ No rompe lo existente: si no mandas assetId/tag, se comporta igual que antes.
 */
export async function GET(req: Request) {
  try {
    const headers = new Headers(req.headers);
    const sessionToken = headers.get("x-session-token");
    const authHeader = headers.get("authorization") || undefined;

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
            "Falta CLOUD_API_API_KEY o CLOUD_API_KEY en variables de entorno",
        },
        { status: 500 }
      );
    }

    const urlIn = new URL(req.url);

    // ✅ parámetros (sin romper nada)
    const limit = urlIn.searchParams.get("limit") ?? "500";
    const assetId = urlIn.searchParams.get("assetId") || "";
    const tag = urlIn.searchParams.get("tag") || "";

    // usamos /transactions global, el SessionToken ya sabe el tenant
    const urlOut = new URL(`${BASE_URL}/transactions`);
    urlOut.searchParams.set("sessionToken", sessionToken);
    urlOut.searchParams.set("limit", limit);

    // ✅ Filtros opcionales (solo si existen)
    if (assetId.trim()) urlOut.searchParams.set("assetId", assetId.trim());
    if (tag.trim()) urlOut.searchParams.set("tag", tag.trim());

    const cloudResp = await fetch(urlOut.toString(), {
      method: "GET",
      headers: {
        "x-api-key": API_KEY,
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
    });

    const text = await cloudResp.text();
    let json: any = null;

    try {
      json = JSON.parse(text);
    } catch {
      if (!cloudResp.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: text || "Respuesta no válida de la API externa",
          },
          { status: cloudResp.status }
        );
      }
      return NextResponse.json(
        { ok: true, transactions: text },
        { status: cloudResp.status }
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

    // el handler de Cloud API devuelve un arreglo de transacciones
    return NextResponse.json({ ok: true, transactions: json });
  } catch (err: any) {
    console.error("GET /api/cloud/transactions error:", err);
    return NextResponse.json(
      { ok: false, error: err.message || "Error consultando transacciones" },
      { status: 500 }
    );
  }
}
