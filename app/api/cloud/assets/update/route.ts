// app/api/cloud/assets/update/route.ts
import { NextResponse } from "next/server";
import { updateAssetsWithSession } from "@/lib/cloudApi";

export async function POST(req: Request) {
  try {
    const headersList = new Headers(req.headers);

    const sessionToken = headersList.get("x-session-token");
    const authHeader = headersList.get("authorization") || undefined;

    // ✅ Mantén tu header como principal
    const tenantIdHeader = headersList.get("x-tenant-id");

    // ✅ Fallback suave (no rompe nada): permite ?tenantId=demo si algún día lo ocupas
    const tenantIdQuery = new URL(req.url).searchParams.get("tenantId");

    const tenantId = (tenantIdHeader || tenantIdQuery || "").trim();

    if (!tenantId) {
      return NextResponse.json(
        { ok: false, error: "Falta x-tenant-id en los headers (o tenantId en query)" },
        { status: 400 }
      );
    }

    if (!sessionToken) {
      return NextResponse.json(
        { ok: false, error: "Falta x-session-token" },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const items = (body?.items || []) as any[];

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { ok: false, error: "items[] requerido" },
        { status: 400 }
      );
    }

    // ✅ Intento de registrar empleado (sin romper tu payload):
    // - Si el item YA trae PersonnelName/personnelName/personnelId, NO lo tocamos.
    // - Si NO trae nada, usamos headers opcionales enviados por el front.
    const userName = (headersList.get("x-user-name") || "").trim();
    const userEmail = (headersList.get("x-user-email") || "").trim();
    const employeeValue = userName || userEmail || "";

    const patchedItems = items.map((it) => {
      // no tocar si no es objeto
      if (!it || typeof it !== "object") return it;

      const alreadyHasEmployee =
        it.PersonnelName ||
        it.personnelName ||
        it.Personnel ||
        it.personnel ||
        it.personnelId ||
        it.PersonnelId ||
        it.EmployeeName ||
        it.employeeName;

      if (alreadyHasEmployee || !employeeValue) return it;

      // ✅ inyecta de forma compatible (no sabemos cuál consume tu backend, mandamos 2)
      return {
        ...it,
        PersonnelName: employeeValue,
        personnelName: employeeValue,
      };
    });

    const result = await updateAssetsWithSession(
      tenantId,
      sessionToken,
      patchedItems,
      authHeader
    );

    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    console.error("POST /api/cloud/assets/update error:", err);
    return NextResponse.json(
      { ok: false, error: err.message || "Error actualizando assets" },
      { status: 500 }
    );
  }
}
