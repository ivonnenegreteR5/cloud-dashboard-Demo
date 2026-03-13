// app/api/cloud/assets/route.ts
import { NextResponse } from "next/server";
import { listAssetsWithSession } from "@/lib/cloudApi";

export async function GET(req: Request) {
  try {
    const headers = new Headers(req.headers);
    const sessionToken = headers.get("x-session-token");

    if (!sessionToken) {
      return NextResponse.json(
        { ok: false, error: "Falta x-session-token" },
        { status: 401 }
      );
    }

    const assets = await listAssetsWithSession(sessionToken, 200);

    return NextResponse.json({ ok: true, assets });
  } catch (err: any) {
    console.error("GET /api/cloud/assets error:", err);
    return NextResponse.json(
      { ok: false, error: err.message || "Error consultando assets" },
      { status: 500 }
    );
  }
}
