// app/api/cloud/locations/route.ts
import { NextResponse } from "next/server";
import {
  listLocationsWithSession,
  upsertLocationWithSession,
  // ✅ NUEVO: para borrar
  deleteLocationWithSession,
} from "@/lib/cloudApi";

// Normaliza distintos formatos posibles de location
function normalizeLocations(
  input: any
): Array<{ id: string; name: string; raw: any }> {
  const arr = Array.isArray(input)
    ? input
    : Array.isArray(input?.items)
      ? input.items
      : Array.isArray(input?.data)
        ? input.data
        : Array.isArray(input?.locations)
          ? input.locations
          : [];

  return (arr || [])
    .map((l: any) => {
      const id = String(
        l?._id ??
          l?.id ??
          l?.location_id ??
          l?.LocationId ??
          l?.code ??
          l?.Location ??
          l?.name ??
          ""
      ).trim();

      const name = String(
        l?.Name ??
          l?.name ??
          l?.label ??
          l?.Location ??
          l?.Description ??
          l?.code ??
          id
      ).trim();

      return { id, name, raw: l };
    })
    .filter((x: any) => x.id);
}

function cleanTenant(value: string | null | undefined) {
  const v = String(value ?? "").trim();
  if (!v) return "";
  if (v.toLowerCase() === "undefined") return "";
  if (v.toLowerCase() === "null") return "";
  return v;
}

function getTenantId(req: Request) {
  const headersList = new Headers(req.headers);
  const urlObj = new URL(req.url);

  // ✅ estándar
  const tenantFromHeader = cleanTenant(headersList.get("x-tenant-id"));
  // ✅ fallbacks (por si alguna parte manda distinto)
  const tenantFromHeaderAlt1 = cleanTenant(headersList.get("x-tenant"));
  const tenantFromHeaderAlt2 = cleanTenant(headersList.get("x-tenantid"));

  // ✅ query fallback
  const tenantFromQuery = cleanTenant(urlObj.searchParams.get("tenantId"));

  return (
    tenantFromHeader ||
    tenantFromHeaderAlt1 ||
    tenantFromHeaderAlt2 ||
    tenantFromQuery ||
    ""
  ).trim();
}

function getAuth(req: Request) {
  const headersList = new Headers(req.headers);
  const sessionToken = headersList.get("x-session-token");
  const authHeader = headersList.get("authorization") || undefined;

  return { sessionToken, authHeader };
}

// ✅ helper: intenta leer JSON sin tronar si viene vacío/no-json
async function safeReadJson(req: Request) {
  try {
    const text = await req.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  } catch {
    return {};
  }
}

function jsonNoStore(body: any, init?: ResponseInit) {
  const res = NextResponse.json(body, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}

// ---------- LISTADO (mantiene lo que ya tenías) ----------
async function handleListLocations(
  req: Request,
  method: "GET" | "POST",
  parsedBody?: any
) {
  const { sessionToken, authHeader } = getAuth(req);
  const urlObj = new URL(req.url);

  let tenantId = getTenantId(req);

  if (!sessionToken) {
    return jsonNoStore(
      { ok: false, error: "Falta x-session-token" },
      { status: 401 }
    );
  }

  // limit: GET por query | POST opcional body
  let limit = 200;

  if (method === "GET") {
    const limitParam = urlObj.searchParams.get("limit");
    limit = limitParam ? Number(limitParam) : 200;
  } else {
    const body = parsedBody ?? (await safeReadJson(req));

    // fallback tenantId en body si no vino en header/query
    const tenantFromBody = cleanTenant(body?.tenantId);
    if (!tenantId && tenantFromBody) tenantId = tenantFromBody;

    if (body && typeof body.limit === "number") {
      limit = body.limit;
    }
  }

  if (!tenantId) {
    return jsonNoStore(
      {
        ok: false,
        error: "Falta x-tenant-id en headers (o tenantId en query/body)",
      },
      { status: 400 }
    );
  }

  const safeLimit = Number.isFinite(limit)
    ? Math.min(Math.max(limit, 1), 500)
    : 200;

  // ✅ tu API lista con sessionToken (query) y auth header (firebase bearer)
  const locationsRaw = await listLocationsWithSession(
    tenantId,
    sessionToken,
    safeLimit,
    authHeader
  );

  const items = normalizeLocations(locationsRaw);

  // ✅ Mantengo "locations" raw como antes (no rompe nada)
  // ✅ Agrego "items" normalizado (para Selects / UI)
  return jsonNoStore(
    {
      ok: true,
      tenantId,
      limit: safeLimit,
      locations: locationsRaw,
      items,
    },
    { status: 200 }
  );
}

// ---------- UPSERT / CREAR ----------
async function handleUpsertLocation(req: Request, parsedBody?: any) {
  const { sessionToken, authHeader } = getAuth(req);
  let tenantId = getTenantId(req);

  if (!sessionToken) {
    return jsonNoStore(
      { ok: false, error: "Falta x-session-token" },
      { status: 401 }
    );
  }

  const body: any = parsedBody ?? (await safeReadJson(req));

  // fallback tenantId en body
  const tenantFromBody = cleanTenant(body?.tenantId);
  if (!tenantId && tenantFromBody) tenantId = tenantFromBody;

  if (!tenantId) {
    return jsonNoStore(
      {
        ok: false,
        error: "Falta x-tenant-id en headers (o tenantId en body)",
      },
      { status: 400 }
    );
  }

  // aceptamos { item: {...} } o directo {...}
  const item = body?.item ?? body;

  // validación mínima
  const id = String(item?.id ?? item?.code ?? "").trim();
  const name = String(item?.name ?? item?.Name ?? "").trim();

  if (!id && !name) {
    return jsonNoStore(
      {
        ok: false,
        error: "Falta item.id (o item.name) para crear/actualizar ubicación",
      },
      { status: 400 }
    );
  }

  const result = await upsertLocationWithSession(
    tenantId,
    sessionToken,
    item,
    authHeader
  );

  return jsonNoStore(
    {
      ok: true,
      tenantId,
      location: result,
    },
    { status: 200 }
  );
}

// ---------- BORRAR ----------
async function handleDeleteLocation(req: Request) {
  const { sessionToken, authHeader } = getAuth(req);
  const urlObj = new URL(req.url);

  let tenantId = getTenantId(req);

  if (!sessionToken) {
    return jsonNoStore(
      { ok: false, error: "Falta x-session-token" },
      { status: 401 }
    );
  }

  // ✅ id puede venir por query ?id=... o por body { id } / { item: { id } }
  const idFromQuery = String(urlObj.searchParams.get("id") || "").trim();

  const body = await safeReadJson(req);
  const tenantFromBody = cleanTenant(body?.tenantId);
  if (!tenantId && tenantFromBody) tenantId = tenantFromBody;

  const idFromBody = String(body?.id || body?.item?.id || body?.name || body?.item?.name || "").trim();

  const locationId = idFromQuery || idFromBody;

  if (!tenantId) {
    return jsonNoStore(
      { ok: false, error: "Falta x-tenant-id en headers (o tenantId en query/body)" },
      { status: 400 }
    );
  }

  if (!locationId) {
    return jsonNoStore(
      { ok: false, error: "Falta id (query ?id=... o body {id} / {item:{id}})" },
      { status: 400 }
    );
  }

  const result = await deleteLocationWithSession(
    tenantId,
    sessionToken,
    locationId,
    authHeader
  );

  return jsonNoStore(
    {
      ok: true,
      tenantId,
      deletedId: locationId,
      result,
    },
    { status: 200 }
  );
}

export async function GET(req: Request) {
  try {
    return await handleListLocations(req, "GET");
  } catch (err: any) {
    console.error("GET /api/cloud/locations error:", err);
    return jsonNoStore(
      { ok: false, error: err?.message || "Error consultando ubicaciones" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    // ✅ leemos body UNA vez (robusto) y lo reusamos
    const body = await safeReadJson(req);

    // ✅ Compat:
    // - si mandas item => crea/upsert
    // - si no mandas item (o mandas mode:"list") => listado como antes
    const mode = String(body?.mode || "").toLowerCase();
    const hasItem =
      !!body?.item || (!!body && (body?.id || body?.name || body?.code));

    if (mode === "list" || !hasItem) {
      return await handleListLocations(req, "POST", body);
    }

    return await handleUpsertLocation(req, body);
  } catch (err: any) {
    console.error("POST /api/cloud/locations error:", err);
    return jsonNoStore(
      { ok: false, error: err?.message || "Error en locations" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    return await handleDeleteLocation(req);
  } catch (err: any) {
    console.error("DELETE /api/cloud/locations error:", err);
    return jsonNoStore(
      { ok: false, error: err?.message || "Error borrando ubicación" },
      { status: 500 }
    );
  }
}

// (opcional) por si algún navegador manda preflight
export async function OPTIONS() {
  return jsonNoStore({ ok: true }, { status: 200 });
}
