// app/api/cloud/assets/one/route.ts
import { NextResponse } from "next/server";

const BASE_URL =
  process.env.CLOUD_API_BASE_URL ||
  process.env.NEXT_PUBLIC_CLOUD_API_BASE_URL ||
  "https://cloudapi-prod-9metrcu7.uc.gateway.dev";

const API_KEY =
  process.env.CLOUD_API_API_KEY ||
  process.env.CLOUD_API_KEY ||
  "";

function looksLikeGatewayNotDefined(msg: string) {
  const m = (msg || "").toLowerCase();
  return (
    m.includes("not defined by this api") ||
    m.includes("the current request is not defined")
  );
}

async function safeJsonFromResponse(resp: Response) {
  const text = await resp.text().catch(() => "");
  if (!text) return { ok: resp.ok, json: null, text: "" };

  try {
    return { ok: resp.ok, json: JSON.parse(text), text };
  } catch {
    // Puede venir HTML del gateway
    return { ok: resp.ok, json: null, text };
  }
}

export async function GET(req: Request) {
  try {
    const headersIn = new Headers(req.headers);

    const sessionToken = headersIn.get("x-session-token");
    const authHeader = headersIn.get("authorization") || undefined;

    // ✅ tenantId: header o query (fallback)
    const urlIn = new URL(req.url);
    const tenantFromQuery = urlIn.searchParams.get("tenantId") || undefined;
    const tenantFromHeader = headersIn.get("x-tenant-id") || undefined;
    const tenantId = (tenantFromHeader || tenantFromQuery || "").trim() || undefined;

    if (!sessionToken) {
      return NextResponse.json(
        { ok: false, error: "Falta x-session-token" },
        { status: 401 }
      );
    }

    if (!API_KEY) {
      return NextResponse.json(
        { ok: false, error: "Falta CLOUD_API_API_KEY o CLOUD_API_KEY en variables de entorno" },
        { status: 500 }
      );
    }

    const id = urlIn.searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Falta parámetro id" },
        { status: 400 }
      );
    }

    // Body igual que el REST: buscar por _id
    const body = {
      auth: { token: sessionToken },
      filter: { _id: id },
      limit: 1,
      skip: 0,
    };

    // ✅ Estrategia:
    // 1) si hay tenantId, intenta /api/v1/{tenantId}/Assets
    // 2) si gateway dice "not defined", fallback a /api/v1/Assets
    const candidates: string[] = [];
    if (tenantId) candidates.push(`/api/v1/${encodeURIComponent(tenantId)}/Assets`);
    candidates.push(`/api/v1/Assets`);

    let lastText = "";
    let lastStatus = 500;
    let lastJson: any = null;

    for (const path of candidates) {
      const cloudResp = await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
        body: JSON.stringify(body),
      });

      const parsed = await safeJsonFromResponse(cloudResp);
      lastText = parsed.text;
      lastStatus = cloudResp.status || 500;
      lastJson = parsed.json;

      // ✅ Si respondió OK, parseamos items
      if (cloudResp.ok && parsed.json) break;

      // ✅ Si fue “not defined by this API”, probamos el siguiente candidato
      if (looksLikeGatewayNotDefined(parsed.text)) {
        continue;
      }

      // Si NO es "not defined", ya no vale la pena intentar el siguiente:
      // ejemplo: 401, 403, 500 real, etc.
      break;
    }

    // El server puede devolver [] (legacy) o { items: [...], total }
    let asset: any | null = null;

    if (Array.isArray(lastJson)) {
      asset = lastJson[0] ?? null;
    } else if (lastJson && Array.isArray(lastJson.items)) {
      asset = lastJson.items[0] ?? null;
    } else if (lastJson && Array.isArray(lastJson.assets)) {
      asset = lastJson.assets[0] ?? null;
    }

    if (!asset) {
      // Si el gateway nos regresó HTML / mensaje raro, lo devolvemos recortado
      const maybeMsg =
        (lastJson && (lastJson.error || lastJson.message)) ||
        (lastText ? lastText.slice(0, 200) : "");

      // Caso: gateway dijo "not defined" incluso para /api/v1/Assets
      if (looksLikeGatewayNotDefined(String(lastText || ""))) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "El API Gateway rechazó la ruta (/Assets). Revisa que exista /api/v1/Assets o /api/v1/{tenant}/Assets en tu spec.",
            raw: String(lastText).slice(0, 200),
          },
          { status: 502 }
        );
      }

      // Caso: API respondió pero sin asset
      if (lastStatus === 200 || lastStatus === 204) {
        return NextResponse.json(
          { ok: false, error: "Activo no encontrado" },
          { status: 404 }
        );
      }

      return NextResponse.json(
        {
          ok: false,
          error: maybeMsg || "Error consultando activo",
          statusCode: lastStatus,
        },
        { status: lastStatus || 500 }
      );
    }

    return NextResponse.json({ ok: true, asset });
  } catch (err: any) {
    console.error("GET /api/cloud/assets/one error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Error interno leyendo activo" },
      { status: 500 }
    );
  }
}
