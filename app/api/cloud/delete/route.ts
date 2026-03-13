// app/api/cloud/assets/delete/route.ts
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

    const body = await req.json().catch(() => ({}));
    const ids = (body?.ids || []) as string[];

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { ok: false, error: "ids[] requerido" },
        { status: 400 }
      );
    }

    // Cuerpo que espera tu API:
    // { "auth": { "token": "{{session_token}}" }, "items": [ { "_id": "X" } ] }
    const cloudBody = {
      auth: { token: sessionToken },
      items: ids.map((id) => ({ _id: String(id) })),
    };

    const cloudResp = await fetch(`${BASE_URL}/api/v1/Assets/Delete`, {
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
      json = JSON.parse(text);
    } catch {
      json = null;
    }

    if (!cloudResp.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: json?.message || text || "Error en Assets/Delete",
          raw: json ?? text,
        },
        { status: cloudResp.status }
      );
    }

    return NextResponse.json({ ok: true, result: json ?? text });
  } catch (err: any) {
    console.error("POST /api/cloud/assets/delete error:", err);
    return NextResponse.json(
      { ok: false, error: err.message || "Error interno borrando assets" },
      { status: 500 }
    );
  }
}
