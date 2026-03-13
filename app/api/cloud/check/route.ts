// app/api/cloud/check/route.ts
import { NextResponse } from "next/server";

const BASE_URL =
  process.env.NEXT_PUBLIC_CLOUD_API_BASE_URL ||
  process.env.CLOUD_API_BASE_URL ||
  "https://cloudapi-prod-9metrcu7.uc.gateway.dev";

const API_KEY = process.env.CLOUD_API_API_KEY || process.env.CLOUD_API_KEY || "";

async function readBodySmart(resp: Response) {
  const text = await resp.text().catch(() => "");
  if (!text) return { json: null as any, text: "" };
  try {
    return { json: JSON.parse(text), text };
  } catch {
    return { json: null as any, text };
  }
}

function looksLikeNotDefined(payload: any, rawText: string) {
  const s = (payload?.error || payload?.message || payload?.raw || rawText || "")
    .toString()
    .toLowerCase();
  return s.includes("not defined by this api") || s.includes("not defined");
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

export async function POST(req: Request) {
  try {
    if (!API_KEY) {
      return NextResponse.json(
        { ok: false, error: "Falta CLOUD_API_API_KEY o CLOUD_API_KEY en variables de entorno" },
        { status: 500 }
      );
    }

    const headersIn = new Headers(req.headers);
    const sessionToken = headersIn.get("x-session-token");
    const authHeader = headersIn.get("authorization") || undefined;

    const tenantFromHeader = headersIn.get("x-tenant-id") || "";
    const { searchParams } = new URL(req.url);
    const tenantFromQuery = searchParams.get("tenantId") || "";
    const tenantId = (tenantFromHeader || tenantFromQuery || "").trim();

    if (!tenantId) {
      return NextResponse.json(
        { ok: false, error: "Falta x-tenant-id en los headers (o tenantId en query)" },
        { status: 400 }
      );
    }
    if (!sessionToken) {
      return NextResponse.json({ ok: false, error: "Falta x-session-token" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);

    const mode = (body?.mode || "").toString().toLowerCase(); // in | out
    const locationId = (body?.locationId || body?.location_id || "").toString().trim();
    const notes = (body?.notes || "").toString();
    const personnelId = (body?.personnelId || "").toString().trim() || undefined;

    // Puedes mandar tag (string) o tags (string[])
    const tag = (body?.tag || body?.epc || "").toString().trim();
    const tagsRaw = Array.isArray(body?.tags) ? body.tags : null;
    const tags: string[] =
      tagsRaw && tagsRaw.length > 0
        ? tagsRaw.map((x: any) => String(x || "").trim()).filter(Boolean)
        : tag
        ? [tag]
        : [];

    if (mode !== "in" && mode !== "out") {
      return NextResponse.json({ ok: false, error: "mode requerido (in | out)" }, { status: 400 });
    }
    if (!locationId) {
      // tu server exige location_id
      return NextResponse.json({ ok: false, error: "location_id requerido" }, { status: 400 });
    }
    if (!tags.length) {
      return NextResponse.json({ ok: false, error: "tag requerido (EPC/RFID)" }, { status: 400 });
    }

    // ✅ Construimos updates como lo exige tu server:
    // required(req.body, ["location_id", "updates"])
    // y recorre updates: up.doc.type === "check", up.doc.mode, up.doc.assets, up.doc.lookup
    const updates = [
      {
        doc: {
          type: "check",
          mode, // "in" | "out"
          lookup: "assetTag", // para que use assetTag/tag
          lastSeen: nowSec(),
          assets: tags.map((t) => ({
            assetTag: t,
            tag: t,
            db_id: t,
          })),
          notes: notes || undefined,
        },
      },
    ];

    const cloudHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-api-key": API_KEY,
    };
    if (authHeader) cloudHeaders["authorization"] = authHeader;

    const cloudBody: any = {
      auth: { token: sessionToken },
      location_id: locationId, // ✅ requerido
      updates, // ✅ requerido
      ...(personnelId ? { personnelId } : {}),
    };

    // En tu server existen /api/v1/:tenantId/Check y /api/:tenantId/Check
    const candidates = [
      `${BASE_URL}/api/v1/${encodeURIComponent(tenantId)}/Check`,
      `${BASE_URL}/api/${encodeURIComponent(tenantId)}/Check`,
      `${BASE_URL}/api/v1/${encodeURIComponent(tenantId)}/check`,
      `${BASE_URL}/api/${encodeURIComponent(tenantId)}/check`,
    ];

    let lastErr: any = null;

    for (const url of candidates) {
      const cloudResp = await fetch(url, {
        method: "POST",
        headers: cloudHeaders,
        body: JSON.stringify(cloudBody),
      });

      const { json, text } = await readBodySmart(cloudResp);
      const payload = json ?? { raw: text };

      // ✅ Consideramos éxito si HTTP ok y no viene status>=400
      const statusNum = typeof payload?.status === "number" ? payload.status : undefined;
      const okLike = cloudResp.ok && payload?.ok !== false && !(statusNum && statusNum >= 400);

      if (okLike) {
        // Extra: confirmación suave (no falla si no está)
        const maybeApplied =
          payload?.total !== undefined ||
          Array.isArray(payload?.items) ||
          Array.isArray(payload?.itemsOut) ||
          payload?.status === 0 ||
          payload?.message === "OK";

        return NextResponse.json(
          {
            ok: true,
            applied: Boolean(maybeApplied),
            tried: url,
            sent: { mode, location_id: locationId, tagsCount: tags.length, personnelId: personnelId || null },
            result: payload,
          },
          { status: 200 }
        );
      }

      if (looksLikeNotDefined(payload, text)) {
        lastErr = { url, status: cloudResp.status, payload };
        continue;
      }

      return NextResponse.json(
        {
          ok: false,
          error:
            payload?.error ||
            payload?.message ||
            payload?.raw ||
            `Error Cloud API (HTTP ${cloudResp.status})`,
          statusCode: cloudResp.status,
          tried: url,
          raw: payload,
        },
        { status: cloudResp.status || 500 }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: "La ruta Check no está definida en tu Cloud API para los endpoints probados.",
        details: lastErr,
        endpointsTried: candidates,
      },
      { status: 501 }
    );
  } catch (err: any) {
    console.error("POST /api/cloud/check error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Error interno registrando movimiento" },
      { status: 500 }
    );
  }
}
