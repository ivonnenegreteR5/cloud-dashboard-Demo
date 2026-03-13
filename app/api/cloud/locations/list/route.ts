// app/api/cloud/locations/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { listLocationsWithSession } from "@/lib/cloudApi";

export async function POST(req: NextRequest) {
  try {
    const sessionToken = req.headers.get("x-session-token");
    const tenantId = req.headers.get("x-tenant-id");
    const authHeader = req.headers.get("authorization") || undefined;

    if (!tenantId) {
      return NextResponse.json(
        { status: 400, message: "Falta x-tenant-id" },
        { status: 400 }
      );
    }

    if (!sessionToken) {
      return NextResponse.json(
        { status: 401, message: "Falta x-session-token" },
        { status: 401 }
      );
    }

    // Opcionalmente podríamos leer limit del body, pero para tu uso actual no es necesario.
    let limit = 200;
    try {
      const body = await req.json().catch(() => null);
      if (body && typeof body.limit === "number") {
        limit = Math.min(Math.max(body.limit, 1), 500);
      }
    } catch {
      // si no hay body o viene mal, ignoramos y usamos 200
    }

    const locations = await listLocationsWithSession(
      tenantId,
      sessionToken,
      limit,
      authHeader
    );

    // 👇 Formato compatible con tu pantalla:
    // if (!res.ok || (data.status !== undefined && data.status !== 0)) ...
    // const items = data.items || data.locations || [];
    return NextResponse.json(
      {
        status: 0,
        message: "OK",
        items: locations,   // para data.items
        locations,          // por si luego quieres data.locations
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("POST /api/cloud/locations/list error:", err);
    return NextResponse.json(
      {
        status: 500,
        message: err.message || "Error consultando ubicaciones",
      },
      { status: 500 }
    );
  }
}
