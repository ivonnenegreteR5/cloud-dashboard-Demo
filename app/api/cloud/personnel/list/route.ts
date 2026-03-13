// app/api/cloud/personnel/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cloudListPersonnel } from "@/lib/cloudApi";

export async function POST(req: NextRequest) {
  try {
    const sessionToken = req.headers.get("x-session-token");
    const tenantIdHeader = req.headers.get("x-tenant-id");
    const authHeader = req.headers.get("authorization") || undefined;

    if (!sessionToken) {
      return NextResponse.json(
        { status: 401, message: "Falta x-session-token" },
        { status: 401 }
      );
    }
    if (!tenantIdHeader) {
      return NextResponse.json(
        { status: 400, message: "Falta x-tenant-id" },
        { status: 400 }
      );
    }

    const tenantId = tenantIdHeader as string;

    // 👇 Lo tipamos como any para poder acceder a data.items / data.personnel sin que TS se queje
    const data: any = await cloudListPersonnel(
      tenantId,
      sessionToken,
      authHeader
    );

    // server.js puede regresar:
    // { status: 0, data: [...] } o { status: 0, items: [...] } o { status: 0, personnel: [...] }
    const items: any[] = data.data || data.items || data.personnel || [];

    return NextResponse.json(
      {
        status: 0,
        items,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("cloud personnel/list error:", err);
    return NextResponse.json(
      { status: 500, message: err.message || "Error interno" },
      { status: 500 }
    );
  }
}
