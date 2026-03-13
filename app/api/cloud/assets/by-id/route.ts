import { NextResponse } from "next/server";

const BASE_URL =
  process.env.CLOUD_API_BASE_URL ||
  "https://cloudapi-prod-9metrcu7.uc.gateway.dev";

const API_KEY = process.env.CLOUD_API_KEY;

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
        { ok: false, error: "Falta CLOUD_API_KEY en variables de entorno" },
        { status: 500 }
      );
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Falta parámetro id" },
        { status: 400 }
      );
    }

    // 🔹 Llamamos a tu Cloud API con filter._id
    const cloudBody = {
      auth: { token: sessionToken },
      filter: { _id: String(id) },
      limit: 1,
      skip: 0,
    };

    const cloudResp = await fetch(`${BASE_URL}/api/v1/Assets`, {
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
      return NextResponse.json(
        {
          ok: false,
          error: "Respuesta no válida de la Cloud API",
          raw: text,
        },
        { status: cloudResp.status }
      );
    }

    if (!cloudResp.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: json?.message || "Error de la Cloud API",
          raw: json,
        },
        { status: cloudResp.status }
      );
    }

    const items = json.items || [];
    const asset = items[0] || null;

    if (!asset) {
      return NextResponse.json(
        { ok: false, error: "Activo no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, asset });
  } catch (err: any) {
    console.error("GET /api/cloud/assets/by-id error:", err);
    return NextResponse.json(
      { ok: false, error: err.message || "Error interno leyendo asset" },
      { status: 500 }
    );
  }
}
