// app/api/cloud/assets/route.ts
import { NextResponse } from "next/server";
import { listAssetsWithSession } from "@/lib/cloudApi";

// ✅ FORZAR SIEMPRE DINÁMICO / SIN CACHÉ en Next
export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 20000;

// ✅ Lista de custom keys que NO quieres que vuelvan a salir (por tenant)
const DELETED_CUSTOM_KEYS_BY_TENANT: Record<string, string[]> = {
  demo: [
    "talla",
    "CampoCinco",
    "CampoCuatro",
    "camposeis",
    "campoTres",
    "EjemploCampo",
    "ejemploDos",
    "EjemploEnDemo",
    "lastCicloAt",
    "xhxhxf",
  ],
};

// ✅ valores “vacíos” que NO deben contar como datos
function isMeaningfulValue(v: any) {
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "boolean") return true;
  return true;
}

// ✅ limpia custom: quita undefined/null/""/"   "/NaN y keys inválidas
function sanitizeCustomObject(custom: any, deletedKeys: Set<string>) {
  if (!custom || typeof custom !== "object") return {};

  const out: Record<string, any> = {};

  for (const [kRaw, v] of Object.entries(custom)) {
    const k = String(kRaw || "").trim();
    if (!k) continue;
    if (k.toLowerCase() === "undefined") continue;

    // 🔥 si está en la blacklist, lo quitamos SIEMPRE
    if (deletedKeys.has(k)) continue;

    if (!isMeaningfulValue(v)) continue;

    out[k] = v;
  }

  return out;
}

// ✅ helper para headers anti-cache
function withNoStore(res: NextResponse) {
  res.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  res.headers.set("Surrogate-Control", "no-store");
  return res;
}

export async function GET(req: Request) {
  try {
    const headers = new Headers(req.headers);
    const sessionToken = headers.get("x-session-token");
    const authHeader = headers.get("authorization") || undefined;

    // ✅ tenantId lo usas en el frontend; aquí lo tomamos para filtrar por tenant
    const tenantId = headers.get("x-tenant-id") || "demo";

    if (!sessionToken) {
      return withNoStore(
        NextResponse.json(
          { ok: false, error: "Falta x-session-token" },
          { status: 401 }
        )
      );
    }

    const url = new URL(req.url);

    // ✅ cache-buster opcional (no es obligatorio, pero ayuda a evitar caches intermedios)
    // Ej: /api/cloud/assets?limit=20000&_ts=...
    // (No lo usamos para lógica, solo para “variar” la URL)
    url.searchParams.get("_ts");

    const limitParam = url.searchParams.get("limit");
    const skipParam = url.searchParams.get("skip");

    const limitNum = limitParam ? Number(limitParam) : DEFAULT_LIMIT;
    const skipNum = skipParam ? Number(skipParam) : 0;

    const safeLimit = Number.isFinite(limitNum)
      ? Math.min(Math.max(limitNum, 1), MAX_LIMIT)
      : DEFAULT_LIMIT;

    const safeSkip = Number.isFinite(skipNum) && skipNum >= 0 ? skipNum : 0;

    const { items, total } = await listAssetsWithSession(
      sessionToken,
      safeLimit,
      safeSkip,
      authHeader
    );

    // ✅ blacklist por tenant
    const deletedKeys = new Set(
      (DELETED_CUSTOM_KEYS_BY_TENANT[String(tenantId)] || []).map((x) => String(x))
    );

    // ✅ Sanitizamos los assets para que NO se filtren columnas fantasma al frontend
    const cleanedItems = (items || []).map((a: any) => {
      const rawCustom = a?.raw?.custom;
      const directCustom = a?.custom;

      // limpiamos ambas fuentes
      const cleanRawCustom = sanitizeCustomObject(rawCustom, deletedKeys);
      const cleanCustom = sanitizeCustomObject(directCustom, deletedKeys);

      // ✅ si tu UI lee a.custom y también a.raw.custom, ambos quedan limpios
      const next = { ...a };

      // si existe raw, la clonamos y limpiamos
      if (next.raw && typeof next.raw === "object") {
        next.raw = { ...next.raw, custom: cleanRawCustom };
      }

      // el custom “normalizado”
      next.custom = cleanCustom;

      return next;
    });

    return withNoStore(
      NextResponse.json({ ok: true, assets: cleanedItems, total }, { status: 200 })
    );
  } catch (err: any) {
    console.error("GET /api/cloud/assets error:", err);
    return withNoStore(
      NextResponse.json(
        { ok: false, error: err.message || "Error consultando assets" },
        { status: 500 }
      )
    );
  }
}
