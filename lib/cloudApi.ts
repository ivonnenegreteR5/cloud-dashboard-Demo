// app/lib/cloudApi.ts
import "server-only";

const BASE_URL =
  process.env.CLOUD_API_BASE_URL ||
  process.env.NEXT_PUBLIC_CLOUD_API_BASE_URL ||
  "https://cloudapi-prod-9metrcu7.uc.gateway.dev";

// API key global de tu proyecto (la misma que usas en REST para el Gateway)
const API_KEY =
  process.env.CLOUD_API_API_KEY || process.env.CLOUD_API_KEY || "";

// ✅ Firebase Web API key (IdentityToolkit) — mejor como variable server
// (mantenemos fallback a NEXT_PUBLIC para compatibilidad, pero NO usamos API_KEY como fallback)
const FIREBASE_WEB_API_KEY =
  process.env.FIREBASE_WEB_API_KEY ||
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
  "";

if (!API_KEY) {
  console.warn("[cloudApi] Falta CLOUD_API_API_KEY en .env.local");
}
if (!FIREBASE_WEB_API_KEY) {
  console.warn(
    "[cloudApi] Falta FIREBASE_WEB_API_KEY (o NEXT_PUBLIC_FIREBASE_API_KEY) en .env.local"
  );
}

/**
 * Extrae el tenant a partir del email.
 * Ej: "hach.admin@hach.local" → "hach"
 */
export function extractTenantFromEmail(email: string): string {
  const [, domain] = email.split("@");
  if (!domain) return "demo";

  const tenant = domain.split(".")[0];
  return tenant || "demo";
}

/** ✅ Helper: arma headers SIN perder x-api-key aunque mandes Authorization */
function mergeHeaders(base: Record<string, string>, extra?: HeadersInit) {
  const out: Record<string, string> = { ...base };

  if (!extra) return out;

  // HeadersInit puede ser objeto, array o Headers
  if (extra instanceof Headers) {
    extra.forEach((v, k) => (out[k] = v));
    return out;
  }

  if (Array.isArray(extra)) {
    for (const [k, v] of extra) out[k] = v;
    return out;
  }

  return { ...out, ...(extra as Record<string, string>) };
}

/** ✅ Helper: parse robusto (si no es JSON, regresa texto) */
async function readBodySmart(resp: Response) {
  const text = await resp.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function fetchJson(url: string, options: RequestInit = {}) {
  const headers = mergeHeaders(
    {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
    },
    options.headers
  );

  const resp = await fetch(url, {
    ...options,
    headers,
  });

  if (resp.status === 204) return null;

  const data = await readBodySmart(resp);

  if (!resp.ok) {
    const msg =
      (data as any)?.message ||
      (data as any)?.error ||
      (data as any)?.details ||
      (data as any)?.raw ||
      resp.statusText ||
      "Request failed";

    throw new Error(`Error HTTP ${resp.status} en ${url} → ${msg}`);
  }

  return data;
}

/**
 * 🔐 Paso 1: signInWithPassword en IdentityToolkit (Firebase)
 * POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={{api_key}}
 *
 * ⚠️ Nota: lo dejamos porque ya lo usabas, pero para el dashboard
 * preferimos usar el idToken que viene del login del cliente
 * (ver createSessionTokenWithFirebaseIdToken).
 */
async function signInWithPassword(email: string, password: string) {
  if (!FIREBASE_WEB_API_KEY) {
    throw new Error(
      "Falta FIREBASE_WEB_API_KEY (o NEXT_PUBLIC_FIREBASE_API_KEY) en .env.local"
    );
  }

  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_WEB_API_KEY}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true,
    }),
  });

  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    throw new Error(
      `Error al hacer signInWithPassword → ${resp.status} ${
        (data as any)?.error?.message || JSON.stringify(data)
      }`
    );
  }

  const idToken = (data as any)?.idToken as string | undefined;

  if (!idToken) {
    throw new Error(
      `No se obtuvo idToken de IdentityToolkit: ${JSON.stringify(data)}`
    );
  }

  return {
    idToken,
    raw: data,
  };
}

/**
 * ✅ NUEVO (recomendado para tu dashboard):
 * Crea SessionToken usando el Firebase ID token que ya generaste en el login (cliente).
 *
 * POST {{BASE_URL}}/api/v1/SessionToken
 * Authorization: Bearer {{id_token_del_cliente}}
 * {
 *   "email": "...",
 *   "password": "...",
 *   "apiKey": "{{FIREBASE_WEB_API_KEY}}"
 * }
 */
export async function createSessionTokenWithFirebaseIdToken(params: {
  email: string;
  password: string;
  idToken: string; // Firebase ID token REAL (aud=rfid-6ce85)
}) {
  const { email, password, idToken } = params;

  if (!email || !password) throw new Error("Email y password requeridos");
  if (!idToken) throw new Error("idToken requerido");

  const url = `${BASE_URL}/api/v1/SessionToken`;

  const body = {
    email,
    password,
    apiKey: FIREBASE_WEB_API_KEY, // igual que tu REST
  };

  const data: any = await fetchJson(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });

  const token =
    data?.auth?.token || data?.token || data?.sessionToken || data?.authToken;

  if (!token) {
    throw new Error(`La API no devolvió sessionToken: ${JSON.stringify(data)}`);
  }

  const tenantId =
    data?.tenantId || data?.user?.tenantId || extractTenantFromEmail(email);

  return {
    sessionToken: token as string,
    idToken, // ✅ reusa el MISMO token del cliente
    expiresAt: data?.expiresAt,
    user: {
      uid: data?.uid ?? data?.user?.uid,
      email: data?.email ?? data?.user?.email ?? email,
      tenantId,
      role: data?.role ?? data?.user?.role,
      locationId: data?.locationId ?? data?.user?.locationId,
      personnelId: data?.personnelId ?? data?.user?.personnelId,
      active: data?.active ?? data?.user?.active,
    },
  };
}

/**
 * 💡 (Se conserva para compatibilidad)
 * Crear SessionToken usando email/password (server hace signInWithPassword).
 */
export async function createSessionTokenWithCredentials(
  email: string,
  password: string
) {
  if (!email || !password) {
    throw new Error("Email y password requeridos");
  }

  // 1) Login con IdentityToolkit (Firebase)
  const { idToken } = await signInWithPassword(email, password);

  // 2) Crear SessionToken en Cloud API
  const url = `${BASE_URL}/api/v1/SessionToken`;

  const body = {
    email,
    password,
    apiKey: FIREBASE_WEB_API_KEY,
  };

  const data: any = await fetchJson(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });

  const token =
    data?.auth?.token || data?.token || data?.sessionToken || data?.authToken;

  if (!token) {
    throw new Error(`La API no devolvió sessionToken: ${JSON.stringify(data)}`);
  }

  const tenantId =
    data?.tenantId || data?.user?.tenantId || extractTenantFromEmail(email);

  return {
    sessionToken: token as string,
    idToken,
    expiresAt: data?.expiresAt,
    user: {
      uid: data?.uid ?? data?.user?.uid,
      email: data?.email ?? data?.user?.email ?? email,
      tenantId,
      role: data?.role ?? data?.user?.role,
      locationId: data?.locationId ?? data?.user?.locationId,
      personnelId: data?.personnelId ?? data?.user?.personnelId,
      active: data?.active ?? data?.user?.active,
    },
  };
}

/**
 * 🔹 Listar assets usando SessionToken
 * POST {{BASE_URL}}/api/v1/Assets
 */
export async function listAssetsWithSession(
  sessionToken: string,
  limit = 100,
  skip = 0,
  authHeader?: string
) {
  if (!sessionToken) throw new Error("sessionToken requerido");

  const url = `${BASE_URL}/api/v1/Assets`;

  const body: any = {
    auth: { token: sessionToken },
    limit,
    skip,
  };

  const data: any = await fetchJson(url, {
    method: "POST",
    headers: authHeader ? { Authorization: authHeader } : undefined,
    body: JSON.stringify(body),
  });

  let items: any[] = [];
  let total = 0;

  if (Array.isArray(data)) {
    items = data;
    total = data.length;
  } else if (data && typeof data === "object") {
    if (Array.isArray(data.items)) items = data.items;
    else if (Array.isArray(data.assets)) items = data.assets;

    if (typeof data.total === "number") total = data.total;
    else total = items.length;
  }

  return { items, total };
}

/**
 * 🗑️ Borrar assets por ids usando SessionToken + tenant
 * POST {{BASE_URL}}/api/v1/{tenant}/Assets/Delete
 */
export async function deleteAssetsWithSession(
  tenantId: string,
  sessionToken: string,
  ids: string[],
  authHeader?: string
) {
  if (!tenantId) throw new Error("tenantId requerido");
  if (!sessionToken) throw new Error("sessionToken requerido");
  if (!ids || ids.length === 0) throw new Error("Lista de ids vacía");

  const url = `${BASE_URL}/api/v1/${tenantId}/Assets/Delete`;

  const body = {
    auth: { token: sessionToken },
    items: ids.map((id) => ({ _id: id })),
  };

  const headers: Record<string, string> = {};
  if (authHeader) headers.Authorization = authHeader;

  return fetchJson(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

/**
 * ✏️ Actualizar assets usando SessionToken + tenant
 * POST {{BASE_URL}}/api/v1/{tenant}/Assets/Update
 */
export async function updateAssetsWithSession(
  tenantId: string,
  sessionToken: string,
  items: any[],
  authHeader?: string
) {
  if (!tenantId) throw new Error("tenantId requerido");
  if (!sessionToken) throw new Error("sessionToken requerido");
  if (!items || items.length === 0) throw new Error("items[] requerido");

  const url = `${BASE_URL}/api/v1/${tenantId}/Assets/Update`;

  const body = {
    auth: { token: sessionToken },
    items,
  };

  const headers: Record<string, string> = {};
  if (authHeader) headers.Authorization = authHeader;

  return fetchJson(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

/**
 * 📍 Listar locations usando SessionToken + tenant
 * GET {{BASE_URL}}/api/v1/{tenantId}/locations?sessionToken=...
 */
export async function listLocationsWithSession(
  tenantId: string,
  sessionToken: string,
  limit = 100,
  authHeader?: string
) {
  if (!tenantId) throw new Error("tenantId requerido");
  if (!sessionToken) throw new Error("sessionToken requerido");

  const url = new URL(`${BASE_URL}/api/v1/${tenantId}/locations`);
  url.searchParams.set("sessionToken", sessionToken);
  url.searchParams.set("limit", String(limit));

  const headers: Record<string, string> = {
    "x-api-key": API_KEY,
  };
  if (authHeader) headers.Authorization = authHeader;

  const resp = await fetch(url.toString(), { method: "GET", headers });
  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    throw new Error((data as any).message || "Error obteniendo locations");
  }

  return data as any[];
}

/**
 * ➕ Crear / actualizar (UPSERT) una location usando SessionToken + tenant
 * POST {{BASE_URL}}/api/v1/{tenantId}/Locations   (nota la L mayúscula)
 */
export async function upsertLocationWithSession(
  tenantId: string,
  sessionToken: string,
  item: any,
  authHeader?: string
) {
  if (!tenantId) throw new Error("tenantId requerido");
  if (!sessionToken) throw new Error("sessionToken requerido");
  if (!item || typeof item !== "object") {
    throw new Error("item requerido para crear/actualizar location");
  }

  // Validación mínima
  const id = String(item?.id ?? item?.code ?? "").trim();
  const name = String(item?.name ?? item?.Name ?? "").trim();

  if (!id && !name) {
    throw new Error("item.id (o item.name) requerido para crear/actualizar location");
  }

  const headers: Record<string, string> = {};
  if (authHeader) headers.Authorization = authHeader;

  const body = {
    auth: { token: sessionToken },
    item,
  };

  // ✅ 1) Intento principal: /Locations (L mayúscula)
  try {
    const urlUpper = `${BASE_URL}/api/v1/${tenantId}/Locations`;
    const data: any = await fetchJson(urlUpper, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    return data;
  } catch {
    // ✅ 2) Fallback: /locations (minúscula) por compat
    const urlLower = `${BASE_URL}/api/v1/${tenantId}/locations`;
    const data: any = await fetchJson(urlLower, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    return data;
  }
}

/**
 * 🗑️ BORRAR / DESACTIVAR LOCATION (para el botón de borrar)
 *
 * Intentos:
 * 1) POST /api/v1/{tenantId}/Locations/Delete  (si existe)
 * 2) SOFT DELETE: upsert active:false en /Locations
 * 3) SOFT DELETE fallback: upsert active:false en /locations
 */
export async function deleteLocationWithSession(
  tenantId: string,
  sessionToken: string,
  locationId: string,
  authHeader?: string
) {
  if (!tenantId) throw new Error("tenantId requerido");
  if (!sessionToken) throw new Error("sessionToken requerido");
  if (!locationId) throw new Error("locationId requerido");

  const headers: Record<string, string> = {};
  if (authHeader) headers.Authorization = authHeader;

  // 1) Hard delete si existe
  try {
    const urlDelete = `${BASE_URL}/api/v1/${tenantId}/Locations/Delete`;
    const bodyDelete = {
      auth: { token: sessionToken },
      item: { id: locationId },
    };

    const data: any = await fetchJson(urlDelete, {
      method: "POST",
      headers,
      body: JSON.stringify(bodyDelete),
    });

    return data;
  } catch {
    // 2) Soft delete: active=false por /Locations
    const softItem = { id: locationId, active: false };

    try {
      const urlUpper = `${BASE_URL}/api/v1/${tenantId}/Locations`;
      const bodyUpper = { auth: { token: sessionToken }, item: softItem };
      const dataUpper: any = await fetchJson(urlUpper, {
        method: "POST",
        headers,
        body: JSON.stringify(bodyUpper),
      });
      return dataUpper;
    } catch {
      // 3) Soft delete fallback: /locations
      const urlLower = `${BASE_URL}/api/v1/${tenantId}/locations`;
      const bodyLower = { auth: { token: sessionToken }, item: softItem };
      const dataLower: any = await fetchJson(urlLower, {
        method: "POST",
        headers,
        body: JSON.stringify(bodyLower),
      });
      return dataLower;
    }
  }
}

/* ============================
 * 🧩 CAMPOS PERSONALIZADOS
 * ============================
 */

export type CustomFieldType = "text" | "number" | "date" | "boolean";

export interface CustomFieldUpsertInput {
  label: string;
  key: string;
  type?: CustomFieldType;
  readOnly?: boolean;
  scope?: string;
}

/**
 * 🔧 Crear / actualizar un campo personalizado de assets
 * POST {{BASE_URL}}/api/v1/{tenantId}/CustomFields
 */
export async function upsertCustomFieldWithSession(
  tenantId: string,
  sessionToken: string,
  field: CustomFieldUpsertInput,
  authHeader?: string
) {
  if (!tenantId) throw new Error("tenantId requerido");
  if (!sessionToken) throw new Error("sessionToken requerido");
  if (!field?.label || !field?.key) {
    throw new Error("label y key son requeridos");
  }

  const url = `${BASE_URL}/api/v1/${tenantId}/CustomFields`;

  const headers: Record<string, string> = {};
  if (authHeader) headers.Authorization = authHeader;

  const body = {
    auth: { token: sessionToken },
    tenantId,
    label: field.label.trim(),
    key: field.key.trim(),
    type: field.type || "text",
    readOnly: field.readOnly ?? false,
    scope: field.scope || "asset",
  };

  return fetchJson(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

/**
 * 📋 Listar campos personalizados de assets
 */
export async function listCustomFieldsWithSession(
  tenantId: string,
  sessionToken: string,
  scope = "asset",
  authHeader?: string
) {
  if (!tenantId) throw new Error("tenantId requerido");
  if (!sessionToken) throw new Error("sessionToken requerido");

  const url = new URL(`${BASE_URL}/api/v1/${tenantId}/CustomFields`);
  url.searchParams.set("sessionToken", sessionToken);
  url.searchParams.set("scope", scope);

  const headers: Record<string, string> = {
    "x-api-key": API_KEY,
  };
  if (authHeader) headers.Authorization = authHeader;

  const resp = await fetch(url.toString(), { method: "GET", headers });
  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    throw new Error(
      (data as any)?.message ||
        (data as any)?.error ||
        "Error obteniendo campos personalizados"
    );
  }

  const items =
    (data as any)?.items ||
    (data as any)?.data?.items ||
    (data as any)?.data ||
    [];

  return {
    status: (data as any)?.status ?? resp.status,
    tenantId,
    scope,
    items: Array.isArray(items) ? items : [],
  };
}

/* ============================
 * 👥 PERSONNEL (USUARIOS)
 * ============================
 */

export async function listPersonnelWithSession(
  tenantId: string,
  sessionToken: string,
  authHeader?: string
) {
  if (!tenantId) throw new Error("tenantId requerido");
  if (!sessionToken) throw new Error("sessionToken requerido");

  const url = new URL(`${BASE_URL}/api/v1/${tenantId}/Personnel`);
  url.searchParams.set("sessionToken", sessionToken);

  const headers: Record<string, string> = {
    "x-api-key": API_KEY,
  };
  if (authHeader) headers.Authorization = authHeader;

  const resp = await fetch(url.toString(), { method: "GET", headers });
  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    throw new Error((data as any).message || "Error obteniendo empleados");
  }

  return data as {
    status: number;
    data: any[];
  };
}

export async function upsertPersonnelWithSession(
  sessionToken: string,
  item: {
    _id: string;
    Name: string;
    Email?: string;
    Location?: string;
    role?: string;
    password?: string;
    active?: boolean;
  },
  authHeader?: string
) {
  if (!sessionToken) throw new Error("sessionToken requerido");
  if (!item?._id || !item?.Name) {
    throw new Error("_id y Name son requeridos en item");
  }

  const url = `${BASE_URL}/api/v1/Personnel`;

  const headers: Record<string, string> = {};
  if (authHeader) headers.Authorization = authHeader;

  const body = {
    auth: { token: sessionToken },
    item,
  };

  const data = await fetchJson(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  return data as any;
}

export async function deletePersonnelWithSession(
  tenantId: string,
  sessionToken: string,
  id: string,
  authHeader?: string
) {
  if (!tenantId) throw new Error("tenantId requerido");
  if (!sessionToken) throw new Error("sessionToken requerido");
  if (!id) throw new Error("id requerido");

  const url = `${BASE_URL}/api/v1/${tenantId}/Personnel/${encodeURIComponent(
    id
  )}`;

  const headers: Record<string, string> = {
    "x-api-key": API_KEY,
  };
  if (authHeader) headers.Authorization = authHeader;

  const body = {
    auth: { token: sessionToken },
  };

  const data = await fetchJson(url, {
    method: "DELETE",
    headers,
    body: JSON.stringify(body),
  });

  return data as any;
}

/**
 * 🔁 Helpers con nombres "cloud*" para usarlos desde /api/cloud/...
 */
export const cloudListPersonnel = listPersonnelWithSession;
export const cloudListLocations = listLocationsWithSession;
export const cloudUpsertLocation = upsertLocationWithSession;

// ✅ opcional: export helper para borrar ubicaciones desde /api/cloud/...
export const cloudDeleteLocation = deleteLocationWithSession;

export async function cloudDeletePersonnel(
  tenantId: string,
  sessionToken: string,
  id: string,
  authHeader?: string
) {
  return deletePersonnelWithSession(tenantId, sessionToken, id, authHeader);
}

export async function cloudCreatePersonnelUser(params: {
  tenantId: string;
  sessionToken: string;
  email: string;
  password: string;
  id?: string;
  name: string;
  role?: string;
  location?: string;
  authHeader?: string;
}) {
  const {
    tenantId,
    sessionToken,
    email,
    password,
    id,
    name,
    role,
    location,
    authHeader,
  } = params;

  return createPersonnelUserWithSession({
    tenantId,
    sessionToken,
    personnelId: id || email,
    name,
    email,
    password,
    role: role || "user",
    Location: location || "",
    authHeader,
  });
}

/* ============================
 * 👤 PERSONNEL (EMPLEADOS)
 * ============================
 */

export interface CreatePersonnelParams {
  tenantId: string;
  sessionToken: string;
  email: string;
  password: string; // compat
  id?: string;
  name: string;
  role?: string;
  location?: string;
  authHeader?: string;
}

export async function createPersonnelWithSession(params: CreatePersonnelParams) {
  const {
    tenantId,
    sessionToken,
    email,
    password,
    id,
    name,
    role,
    location,
    authHeader,
  } = params;

  if (!tenantId) throw new Error("tenantId requerido");
  if (!sessionToken) throw new Error("sessionToken requerido");
  if (!email) throw new Error("email requerido");
  if (!name) throw new Error("name requerido");

  const url = `${BASE_URL}/api/v1/${tenantId}/Personnel`;

  const headers: Record<string, string> = {};
  if (authHeader) headers.Authorization = authHeader;

  const body = {
    auth: { token: sessionToken },
    item: {
      _id: id || email,
      Name: name,
      Email: email,
      Location: location || "",
      role: role || "",
      password,
    },
  };

  const data = await fetchJson(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  return data as any;
}

/** ============================
 * 👥 PERSONNEL (Firebase Auth + Personnel)
 * ============================
 */

export interface CreatePersonnelUserParams {
  tenantId: string;
  sessionToken: string;
  personnelId: string;
  name: string;
  email: string;
  password: string;
  role?: string;
  Location?: string;
  authHeader?: string;
}

export async function createPersonnelUserWithSession(
  params: CreatePersonnelUserParams
) {
  const {
    tenantId,
    sessionToken,
    personnelId,
    name,
    email,
    password,
    role = "user",
    Location = "",
    authHeader,
  } = params;

  if (!tenantId) throw new Error("tenantId requerido");
  if (!sessionToken) throw new Error("sessionToken requerido");
  if (!personnelId) throw new Error("personnelId requerido");
  if (!name) throw new Error("name requerido");
  if (!email) throw new Error("email requerido");
  if (!password) throw new Error("password requerido");

  const url = `${BASE_URL}/api/v1/${tenantId}/Personnel/CreateUser`;

  const headers: Record<string, string> = {};
  if (authHeader) headers.Authorization = authHeader;

  const body = {
    auth: { token: sessionToken },
    email,
    password,
    name,
    personnelId,
    role,
    Location,
  };

  return fetchJson(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

export async function setPersonnelActiveWithSession(params: {
  tenantId: string;
  sessionToken: string;
  ids: string[];
  active: boolean;
  authHeader?: string;
}) {
  const { tenantId, sessionToken, ids, active, authHeader } = params;

  if (!tenantId) throw new Error("tenantId requerido");
  if (!sessionToken) throw new Error("sessionToken requerido");
  if (!ids || ids.length === 0) throw new Error("ids[] requerido");

  const endpoint = active ? "Enable" : "Disable";
  const url = `${BASE_URL}/api/v1/${tenantId}/Personnel/${endpoint}`;

  const headers: Record<string, string> = {};
  if (authHeader) headers.Authorization = authHeader;

  const body = {
    auth: { token: sessionToken },
    items: ids.map((id) => ({ id })),
  };

  return fetchJson(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

export async function deletePersonnelBulkWithSession(params: {
  tenantId: string;
  sessionToken: string;
  ids: string[];
  authHeader?: string;
}) {
  const { tenantId, sessionToken, ids, authHeader } = params;

  if (!tenantId) throw new Error("tenantId requerido");
  if (!sessionToken) throw new Error("sessionToken requerido");
  if (!ids || ids.length === 0) throw new Error("ids[] requerido");

  const url = `${BASE_URL}/api/v1/${tenantId}/Personnel/Delete`;

  const headers: Record<string, string> = {};
  if (authHeader) headers.Authorization = authHeader;

  const body = {
    auth: { token: sessionToken },
    items: ids.map((id) => ({ id })),
  };

  return fetchJson(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

// app/lib/cloudApi.ts

export async function deleteCustomFields(params: {
  baseUrl: string;
  tenantId: string;
  firebaseIdToken: string; // Bearer
  sessionToken: string; // auth.token
  keys: string[];
  scope?: "asset" | "personnel";
}) {
  const { baseUrl, tenantId, firebaseIdToken, sessionToken, keys, scope = "asset" } = params;

  const resp = await fetch(`${baseUrl}/api/v1/${tenantId}/CustomFields/Delete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${firebaseIdToken}`,
    },
    body: JSON.stringify({
      auth: { token: sessionToken },
      keys,
      scope, // "asset" usa assetCustomFields; "personnel" usa customFields
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`deleteCustomFields failed (${resp.status}): ${txt}`);
  }

  return resp.json();
}

export async function cleanupAssetsCustomKeys(params: {
  baseUrl: string;
  tenantId: string;
  firebaseIdToken: string;
  sessionToken: string;
  keys: string[];
}) {
  const { baseUrl, tenantId, firebaseIdToken, sessionToken, keys } = params;

  const resp = await fetch(`${baseUrl}/api/v1/${tenantId}/Assets/Custom/Cleanup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${firebaseIdToken}`,
    },
    body: JSON.stringify({
      auth: { token: sessionToken },
      keys,
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`cleanupAssetsCustomKeys failed (${resp.status}): ${txt}`);
  }

  return resp.json();
}
