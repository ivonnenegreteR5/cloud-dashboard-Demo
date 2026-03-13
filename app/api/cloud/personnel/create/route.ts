// app/api/cloud/personnel/create/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cloudCreatePersonnelUser } from "@/lib/cloudApi";

export async function POST(req: NextRequest) {
  try {
    const sessionToken = req.headers.get("x-session-token");
    const tenantIdHeader = req.headers.get("x-tenant-id");
    const authHeader = req.headers.get("authorization") || undefined; // Bearer {idToken}

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

    const tenantId = String(tenantIdHeader);

    const body = await req.json();
    const email = String(body?.email || "").trim();
    const password = String(body?.password || "");
    const name = String(body?.name || "").trim();
    const id = body?.id ? String(body.id).trim() : undefined;
    const role = body?.role ? String(body.role).trim() : "user";
    const location = body?.location ? String(body.location).trim() : "";

    if (!email || !password) {
      return NextResponse.json(
        { status: 400, message: "Email y password son obligatorios" },
        { status: 400 }
      );
    }
    if (!name) {
      return NextResponse.json(
        { status: 400, message: "Name es obligatorio" },
        { status: 400 }
      );
    }
    if (password.length < 6) {
      return NextResponse.json(
        { status: 400, message: "La contraseña debe tener al menos 6 caracteres" },
        { status: 400 }
      );
    }

    // ✅ Crea usuario en Firebase Auth + guarda/actualiza en Personnel
    const data = await cloudCreatePersonnelUser({
      tenantId,
      sessionToken,
      email,
      password,
      name,
      id,
      role: role || "user",
      location,
      authHeader,
    });

    return NextResponse.json(data, { status: 200 });
  } catch (err: any) {
    console.error("cloud personnel/create error:", err);
    return NextResponse.json(
      { status: 500, message: err?.message || "Error interno" },
      { status: 500 }
    );
  }
}

