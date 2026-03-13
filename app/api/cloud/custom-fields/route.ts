// app/api/cloud/custom-fields/route.ts
import { NextResponse } from "next/server";

const BASE_URL =
  process.env.NEXT_PUBLIC_CLOUD_API_BASE_URL ||
  process.env.CLOUD_API_BASE_URL ||
  "https://cloudapi-prod-9metrcu7.uc.gateway.dev";

const API_KEY = process.env.CLOUD_API_API_KEY || process.env.CLOUD_API_KEY || "";

// ---------------------------
// Helpers (mantenemos robustez)
// ---------------------------
async function safeReadJson(resp: Response) {
  const text = await resp.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
    return { ok: true, data, text };
  } catch {
    return { ok: false, data: null, text };
  }
}

function buildCloudHeaders(authHeader?: string) {
  const cloudHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "x-api-key": API_KEY,
  };
  if (authHeader) cloudHeaders["authorization"] = authHeader;
  return cloudHeaders;
}

// ✅ Nuevo: valor significativo (para detectar uso real en assets)
function isMeaningfulValue(v: any) {
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "boolean") return true;
  return true;
}

/**
 * ✅ Nuevo: obtiene el conjunto de custom keys realmente usadas en assets del tenant
 * Usa el endpoint /assets que tú ya probaste que regresa un array.
 *
 * Nota: si hay muchos assets, este endpoint puede paginar en tu backend real.
 * Aquí usamos limit alto. Si tu server pagina, dime y lo hacemos paginado.
 */
async function fetchUsedCustomKeys(params: {
  tenantId: string;
  sessionToken: string;
  authHeader?: string;
}) {
  const { tenantId, sessionToken, authHeader } = params;

  const headers = buildCloudHeaders(authHeader);

  // OJO: este endpoint lo confirmaste tú que existe y regresa array JSON
  // (si en tu backend cambia, lo ajustamos a /api/v1/{tenantId}/Assets)
  const url = new URL(`${BASE_URL}/assets`);
  url.searchParams.set("sessionToken", sessionToken);
  url.searchParams.set("limit", "20000"); // ajusta si tu backend tiene límite menor

  const res = await fetch(url.toString(), { method: "GET", headers });
  const parsed = await safeReadJson(res);

  if (!parsed.ok || !res.ok) {
    // Si falla, regresamos set vacío para no romper
    console.warn(
      "[custom-fields][GET] No se pudo calcular usage desde assets. HTTP:",
      res.status,
      "inicio:",
      (parsed.text || "").slice(0, 120)
    );
    return new Set<string>();
  }

  const data = parsed.data;
  const assets: any[] = Array.isArray(data) ? data : (data?.items || data?.assets || []);
  const used = new Set<string>();

  for (const a of assets) {
    const c = (a && a.custom) || (a && a.raw && a.raw.custom) || null;
    if (!c || typeof c !== "object") continue;

    for (const [k, v] of Object.entries(c)) {
      const kk = String(k || "").trim();
      if (!kk) continue;
      if (kk.toLowerCase() === "undefined") continue;
      if (!isMeaningfulValue(v)) continue;
      used.add(kk);
    }
  }

  return used;
}

// =====================================================
// GET /api/cloud/custom-fields?tenantId=demo&hideUnused=1
//   → lista campos personalizados (scope=asset)
//   ✅ hideUnused=1 => elimina definiciones que no aparecen en assets
// =====================================================
export async function GET(req: Request) {
  try {
    if (!API_KEY) {
      return NextResponse.json(
        {
          ok: false,
          error: "Falta CLOUD_API_API_KEY o CLOUD_API_KEY en variables de entorno",
        },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId") || "";
    const hideUnused = searchParams.get("hideUnused") === "1";

    if (!tenantId) {
      return NextResponse.json(
        { ok: false, error: "tenantId requerido" },
        { status: 400 }
      );
    }

    const headersIn = new Headers(req.headers);
    const sessionToken = headersIn.get("x-session-token");
    const authHeader = headersIn.get("authorization") || undefined;

    if (!sessionToken) {
      return NextResponse.json(
        { ok: false, error: "sessionToken requerido" },
        { status: 401 }
      );
    }

    const cloudHeaders = buildCloudHeaders(authHeader);

    // ✅ 1) Intento #1: alias que ya usabas (no lo quitamos)
    const urlAlias = new URL(
      `${BASE_URL}/api/${encodeURIComponent(tenantId)}/custom-fields`
    );
    urlAlias.searchParams.set("sessionToken", sessionToken);
    urlAlias.searchParams.set("scope", "asset");

    let cloudRes = await fetch(urlAlias.toString(), {
      method: "GET",
      headers: cloudHeaders,
    });

    let parsed = await safeReadJson(cloudRes);

    // ✅ Si el alias devolvió HTML/No-JSON o error HTTP, hacemos fallback automático:
    const aliasBad =
      !parsed.ok ||
      !cloudRes.ok ||
      (parsed.data && typeof parsed.data.status === "number" && parsed.data.status >= 400) ||
      (parsed.data && parsed.data.ok === false);

    if (aliasBad) {
      // ✅ 2) Fallback: ruta v1 oficial
      const urlV1 = new URL(
        `${BASE_URL}/api/v1/${encodeURIComponent(tenantId)}/CustomFields`
      );
      urlV1.searchParams.set("sessionToken", sessionToken);
      urlV1.searchParams.set("scope", "asset");

      cloudRes = await fetch(urlV1.toString(), {
        method: "GET",
        headers: cloudHeaders,
      });

      parsed = await safeReadJson(cloudRes);
    }

    // Si aún no es JSON válido:
    if (!parsed.ok) {
      console.error(
        "[custom-fields][GET] Cloud API devolvió algo que no es JSON. Inicio:",
        (parsed.text || "").slice(0, 200)
      );
      return NextResponse.json(
        {
          ok: false,
          error: "Cloud API devolvió HTML o JSON inválido",
          raw: (parsed.text || "").slice(0, 200),
        },
        { status: 502 }
      );
    }

    const data = parsed.data;

    // Si respondió error:
    if (
      !cloudRes.ok ||
      data.ok === false ||
      (typeof data.status === "number" && data.status >= 400)
    ) {
      console.error("[custom-fields][GET] Cloud API error", cloudRes.status, data);
      return NextResponse.json(
        {
          ok: false,
          statusCode: cloudRes.status,
          error:
            data.error ||
            data.message ||
            data.raw ||
            `Error desde Cloud API (HTTP ${cloudRes.status})`,
          raw: data,
        },
        { status: cloudRes.status }
      );
    }

    // server responde tipo:
    // { status: 0, tenantId, scope, items: [...] }
    let items: any[] = Array.isArray(data.items) ? data.items : [];

    // ✅ Nuevo: filtrar definiciones sin uso real (opcional)
    if (hideUnused) {
      const usedKeys = await fetchUsedCustomKeys({
        tenantId,
        sessionToken,
        authHeader,
      });

      // NOTA: si usedKeys viene vacío por falla, no filtramos agresivo
      if (usedKeys.size > 0) {
        items = items.filter((it) => {
          const k = String(it?.key || "").trim();
          if (!k) return false; // si no tiene key, lo sacamos
          if (k.toLowerCase() === "undefined") return false;
          return usedKeys.has(k);
        });
      } else {
        // Si no pudimos calcular usage, al menos limpiamos registros sin key
        items = items.filter((it) => {
          const k = String(it?.key || "").trim();
          if (!k) return false;
          if (k.toLowerCase() === "undefined") return false;
          return true;
        });
      }
    } else {
      // Comportamiento original: solo limpiamos basura obvia
      items = items.filter((it) => {
        const k = String(it?.key || "").trim();
        if (!k) return false;
        if (k.toLowerCase() === "undefined") return false;
        return true;
      });
    }

    return NextResponse.json(
      {
        ok: true,
        tenantId: data.tenantId ?? tenantId,
        scope: data.scope ?? "asset",
        items,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[custom-fields][GET] internal error", err);
    return NextResponse.json(
      {
        ok: false,
        error: "Error interno en API Next",
        details: String(err),
      },
      { status: 500 }
    );
  }
}

// =====================================================
// POST /api/cloud/custom-fields
//   → crear / actualizar campo personalizado
// =====================================================
export async function POST(req: Request) {
  try {
    if (!API_KEY) {
      return NextResponse.json(
        {
          ok: false,
          error: "Falta CLOUD_API_API_KEY o CLOUD_API_KEY en variables de entorno",
        },
        { status: 500 }
      );
    }

    const headersIn = new Headers(req.headers);
    const sessionToken = headersIn.get("x-session-token");
    const authHeader = headersIn.get("authorization") || undefined;

    if (!sessionToken) {
      return NextResponse.json(
        { ok: false, error: "sessionToken requerido en cabecera x-session-token" },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => null);

    const tenantId = body?.tenantId as string | undefined;
    const label = body?.label as string | undefined;
    const key = body?.key as string | undefined;
    const type = (body?.type as string | undefined) ?? "text";
    const readOnly = (body?.readOnly as boolean | undefined) ?? false;
    const scope = (body?.scope as string | undefined) ?? "asset";

    if (!tenantId) {
      return NextResponse.json(
        { ok: false, error: "tenantId requerido en el body" },
        { status: 400 }
      );
    }
    if (!label || !key) {
      return NextResponse.json(
        { ok: false, error: "label y key son requeridos" },
        { status: 400 }
      );
    }

    const cloudHeaders = buildCloudHeaders(authHeader);

    // POST https://.../api/v1/{tenantId}/CustomFields
    const url = `${BASE_URL}/api/v1/${encodeURIComponent(tenantId)}/CustomFields`;

    const cloudBody = {
      auth: { token: sessionToken },
      tenantId,
      label: label.trim(),
      key: key.trim(),
      type,
      readOnly,
      scope,
    };

    const cloudRes = await fetch(url, {
      method: "POST",
      headers: cloudHeaders,
      body: JSON.stringify(cloudBody),
    });

    const parsed = await safeReadJson(cloudRes);

    if (!parsed.ok) {
      console.error(
        "[custom-fields][POST] Cloud API devolvió algo que no es JSON. Inicio:",
        (parsed.text || "").slice(0, 200)
      );
      return NextResponse.json(
        {
          ok: false,
          error: "Cloud API devolvió HTML o JSON inválido al crear campo",
          raw: (parsed.text || "").slice(0, 200),
        },
        { status: 502 }
      );
    }

    const data = parsed.data;

    if (
      !cloudRes.ok ||
      data.ok === false ||
      (typeof data.status === "number" && data.status >= 400)
    ) {
      console.error("[custom-fields][POST] Cloud API error", cloudRes.status, data);
      return NextResponse.json(
        {
          ok: false,
          statusCode: cloudRes.status,
          error:
            data.error ||
            data.message ||
            data.raw ||
            `Error desde Cloud API (HTTP ${cloudRes.status})`,
          raw: data,
        },
        { status: cloudRes.status }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        result: data,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[custom-fields][POST] internal error", err);
    return NextResponse.json(
      {
        ok: false,
        error: "Error interno en API Next al crear campo",
        details: String(err),
      },
      { status: 500 }
    );
  }
}
