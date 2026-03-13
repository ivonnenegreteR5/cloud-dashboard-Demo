// app/[tenant]/activos/[id]/page.tsx
"use client";

import React, { useMemo, useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTenant } from "@/components/tenant-context";
import { AppHeader } from "@/components/app-header";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type TabId = "resumen" | "historico" | "movimiento";

interface ApiAsset {
  _id?: string;
  id?: string;
  AssetTag?: string;
  tag?: string;
  AssetType?: string;
  type?: string;
  Location?: string;
  locationId?: string;
  status?: string;
  Status?: string;
  custom?: Record<string, any>;
  [k: string]: any;
}

interface ApiTransaction {
  id?: string;
  assetId?: string;
  locationId?: string;
  mode?: "in" | "out" | string;
  time?: number;
  byName?: string;
  byEmail?: string;
  assetType?: string;
  assetCode?: string;
  notes?: string;
  [k: string]: any;
}

// Campos personalizados (definiciones)
interface AssetCustomFieldDef {
  key: string;
  label: string;
  type?: string; // text | number | date | boolean
  readOnly?: boolean;
}

// ✅ Locations reales (para movimiento manual + mostrar nombre en histórico)
interface ApiLocation {
  id?: string;
  _id?: string;
  locationId?: string;
  location_id?: string;
  name?: string;
  LocationName?: string;
  label?: string;
  locationName?: string;
  [k: string]: any;
}
interface UiLocation {
  id: string; // location_id real
  label: string;
}

// ===================== Helpers =====================

function normalizeCustomFieldType(
  t?: string
): "text" | "number" | "date" | "boolean" {
  const v = String(t || "").toLowerCase().trim();
  if (v === "number" || v === "numeric" || v === "int" || v === "float")
    return "number";
  if (v === "date" || v === "datetime") return "date";
  if (v === "boolean" || v === "bool") return "boolean";
  return "text";
}

function sanitizeCustom(
  defs: AssetCustomFieldDef[],
  values: Record<string, any>
): Record<string, any> {
  const out: Record<string, any> = {};
  const defMap = new Map(defs.map((d) => [d.key, d]));

  for (const [k, raw] of Object.entries(values || {})) {
    const def = defMap.get(k);
    const t = normalizeCustomFieldType(def?.type);

    if (raw === undefined || raw === null) continue;

    if (t === "boolean") {
      out[k] = Boolean(raw);
      continue;
    }

    if (typeof raw === "string") {
      const s = raw.trim();
      if (!s) continue;

      if (t === "number") {
        const n = Number(s);
        if (Number.isFinite(n)) out[k] = n;
        continue;
      }

      out[k] = s;
      continue;
    }

    if (t === "number") {
      const n = Number(raw);
      if (Number.isFinite(n)) out[k] = n;
      continue;
    }

    out[k] = raw;
  }

  return out;
}

function pickAssetDocId(a: ApiAsset | null, fallbackId: string) {
  return String(
    a?._id || a?.id || a?.AssetTag || a?.tag || fallbackId || ""
  ).trim();
}

function pickAssetTag(a: ApiAsset | null, fallbackId: string) {
  return String(
    a?.AssetTag || a?.tag || a?._id || a?.id || fallbackId || ""
  ).trim();
}

function pickAssetType(a: ApiAsset | null) {
  return String(a?.AssetType || a?.type || a?.Description || "").trim();
}

function pickAssetLocation(a: ApiAsset | null) {
  return String(a?.Location || a?.locationId || a?.location || "").trim();
}

function pickAssetStatusRaw(a: ApiAsset | null) {
  return String(a?.status || a?.Status || "creado").trim();
}

function statusToDisplay(statusRaw: string) {
  const s = (statusRaw || "").toLowerCase();
  if (s === "in" || s === "checked in") return "Entrada";
  if (s === "out" || s === "checked out") return "Salida";
  return statusRaw || "creado";
}

function pickLocationId(l: ApiLocation): string {
  return String(l.location_id || l.locationId || l._id || l.id || "").trim();
}
function pickLocationLabel(l: ApiLocation): string {
  return String(
    l.name || l.LocationName || l.label || l.locationName || l.id || l._id || ""
  ).trim();
}

function safeDateTimeFromSeconds(seconds?: number) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "—";
  return new Date(seconds * 1000).toLocaleString();
}

function modeToUi(mode?: string) {
  const m = String(mode || "").toLowerCase();
  if (m === "in") return { label: "Entrada", variant: "default" as const };
  if (m === "out") return { label: "Salida", variant: "secondary" as const };
  return { label: m || "—", variant: "outline" as const };
}

// ===================== Página =====================

export default function DetalleActivoPage() {
  const tenantId = useTenant();
  const params = useParams();
  const id = params?.id as string;

  const tenantSafe =
    typeof tenantId === "string" && tenantId.trim().length > 0 ? tenantId : "demo";

  const [tab, setTab] = useState<TabId>("resumen");

  // --- estado API ---
  const [asset, setAsset] = useState<ApiAsset | null>(null);
  const [assetLoading, setAssetLoading] = useState(true);
  const [assetError, setAssetError] = useState<string | null>(null);

  const [txs, setTxs] = useState<ApiTransaction[]>([]);
  const [txsLoading, setTxsLoading] = useState(false);

  // ✅ Custom fields (definiciones)
  const [customFieldsFromApi, setCustomFieldsFromApi] = useState<
    AssetCustomFieldDef[]
  >([]);
  const [customFieldsError, setCustomFieldsError] = useState<string | null>(null);

  // ✅ Form editable (Resumen): RFID, Activo, Ubicación (texto) + custom
  const [editTag, setEditTag] = useState("");
  const [editType, setEditType] = useState("");
  const [editLocationText, setEditLocationText] = useState("");

  // ✅ Valores editables de custom fields
  const [editCustom, setEditCustom] = useState<Record<string, any>>({});

  const [savingResumen, setSavingResumen] = useState(false);

  // ✅ Movimiento manual (aquí sí Entrada/Salida + Ubicación REAL)
  const [movTipo, setMovTipo] = useState<"in" | "out" | "">("");
  const [movUbicacionId, setMovUbicacionId] = useState<string>("");
  const [movNotas, setMovNotas] = useState<string>("");

  const [locations, setLocations] = useState<UiLocation[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationsError, setLocationsError] = useState<string | null>(null);

  const base = `/${tenantSafe}`;

  const displayDocId = useMemo(() => pickAssetDocId(asset, id), [asset, id]);
  const displayEpc = useMemo(() => pickAssetTag(asset, id), [asset, id]);

  const displayNombreActivo = useMemo(
    () => pickAssetType(asset) || "ACTIVO",
    [asset]
  );
  const displayUbicacion = useMemo(() => pickAssetLocation(asset) || "—", [asset]);

  const statusRaw = useMemo(() => pickAssetStatusRaw(asset), [asset]);
  const displayEstado = useMemo(() => statusToDisplay(statusRaw), [statusRaw]);

  const badgeVariant =
    displayEstado === "Entrada"
      ? ("default" as const)
      : displayEstado === "Salida"
      ? ("secondary" as const)
      : ("outline" as const);

  // ✅ Mapa para mostrar nombres de ubicaciones en histórico
  const locationLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const loc of locations) {
      m.set(String(loc.id), String(loc.label));
    }
    return m;
  }, [locations]);

  const resolveLocationLabel = useCallback(
    (locationId?: string) => {
      const id0 = String(locationId || "").trim();
      if (!id0) return "—";
      return locationLabelById.get(id0) || id0;
    },
    [locationLabelById]
  );

  // ==========================================================
  // ✅ OCULTAR CAMPOS PERSONALIZADOS (aplica en TODO: resumen + guardar)
  // Usa el MISMO key que en la tabla para que sea global por tenant
  // ==========================================================
  const HIDDEN_CF_STORAGE_KEY = useMemo(
    () => `cloud:hiddenCustomFields:${tenantSafe}:assets`,
    [tenantSafe]
  );
  const [hiddenCustomKeys, setHiddenCustomKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HIDDEN_CF_STORAGE_KEY);
      if (!raw) {
        setHiddenCustomKeys(new Set());
        return;
      }
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) setHiddenCustomKeys(new Set(arr.map((x) => String(x))));
      else setHiddenCustomKeys(new Set());
    } catch {
      setHiddenCustomKeys(new Set());
    }
  }, [HIDDEN_CF_STORAGE_KEY]);

  const isHiddenCustom = useCallback(
    (key: string) => hiddenCustomKeys.has(String(key)),
    [hiddenCustomKeys]
  );

  const filterOutHiddenCustom = useCallback(
    (obj: Record<string, any>) => {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(obj || {})) {
        if (isHiddenCustom(k)) continue;
        out[k] = v;
      }
      return out;
    },
    [isHiddenCustom]
  );
  // ==========================================================

  // ==========================================================
  // ✅ INYECTAR "Ciclos de lavado" aunque no venga del API
  // (para que aparezca/sea editable en Resumen)
  // ==========================================================
  const EXTRA_EDITABLE_CUSTOM_FIELDS: AssetCustomFieldDef[] = useMemo(() => {
    return [
      {
        key: "ciclosLavado",
        label: "Ciclos de lavado",
        type: "number",
        readOnly: false, // ✅ editable
      },
    ];
  }, []);

  // Lista final de fields para formularios (API + extras, sin duplicar)
  const customFieldsForForms: AssetCustomFieldDef[] = useMemo(() => {
    const map = new Map<string, AssetCustomFieldDef>();

    for (const cf of customFieldsFromApi || []) {
      if (!cf?.key) continue;
      map.set(String(cf.key), {
        key: String(cf.key),
        label: cf.label || String(cf.key),
        type: cf.type,
        readOnly: cf.readOnly,
      });
    }

    for (const cf of EXTRA_EDITABLE_CUSTOM_FIELDS) {
      const k = String(cf.key);
      if (!map.has(k)) map.set(k, cf);
    }

    return Array.from(map.values()).sort((a, b) =>
      String(a.label || a.key).localeCompare(String(b.label || b.key))
    );
  }, [customFieldsFromApi, EXTRA_EDITABLE_CUSTOM_FIELDS]);
  // ==========================================================

  // =================== Fetch custom fields ===================

  const fetchCustomFields = async (tenant: string, sToken: string, iToken: string) => {
    try {
      setCustomFieldsError(null);

      const resp = await fetch(
        `/api/cloud/custom-fields?tenantId=${encodeURIComponent(String(tenant))}`,
        {
          headers: {
            "x-session-token": sToken,
            Authorization: `Bearer ${iToken}`,
            "x-tenant-id": String(tenant),
          },
        }
      );

      const text = await resp.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        setCustomFieldsError("No se pudieron cargar los campos personalizados.");
        setCustomFieldsFromApi([]);
        return;
      }

      if (!resp.ok || data.ok === false) {
        setCustomFieldsError(
          data.error || "No se pudieron cargar los campos personalizados."
        );
        setCustomFieldsFromApi([]);
      } else {
        setCustomFieldsFromApi(Array.isArray(data.items) ? data.items : []);
      }
    } catch (err: any) {
      setCustomFieldsError(
        err?.message || "No se pudieron cargar los campos personalizados."
      );
      setCustomFieldsFromApi([]);
    }
  };

  // =================== Fetch locations (para movimiento manual + histórico) ===================
  const fetchLocations = async (tenant: string, sToken: string, iToken: string) => {
    try {
      setLocationsLoading(true);
      setLocationsError(null);

      const resp = await fetch(`/api/cloud/locations?limit=500`, {
        headers: {
          "x-session-token": sToken,
          Authorization: `Bearer ${iToken}`,
          "x-tenant-id": String(tenant),
        },
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.ok) {
        throw new Error(data.error || "No se pudieron cargar ubicaciones");
      }

      const raw: ApiLocation[] = Array.isArray(data.locations) ? data.locations : [];
      const mapped: UiLocation[] = raw
        .map((l: ApiLocation) => ({ id: pickLocationId(l), label: pickLocationLabel(l) }))
        .filter((x: UiLocation) => Boolean(x.id) && Boolean(x.label));

      setLocations(mapped);

      // ✅ Preselecciona ubicación actual en movimiento manual
      if (!movUbicacionId && asset) {
        const current = String(asset.locationId || asset.Location || "").trim();
        const found =
          mapped.find((m) => m.id === current) ||
          mapped.find((m) => m.label.toLowerCase() === current.toLowerCase());
        if (found) setMovUbicacionId(found.id);
      }
    } catch (err: any) {
      setLocationsError(err?.message || "No se pudieron cargar ubicaciones");
      setLocations([]);
    } finally {
      setLocationsLoading(false);
    }
  };

  // =================== Fetch histórico (by-asset) ===================
  const fetchTxsByAsset = useCallback(
    async (assetIdForTx: string) => {
      const sToken = localStorage.getItem("cloudSessionToken");
      const iToken = localStorage.getItem("cloudIdToken");
      if (!sToken || !iToken) return;

      setTxsLoading(true);
      try {
        const respTx = await fetch(
          `/api/cloud/transactions/by-asset?assetId=${encodeURIComponent(
            String(assetIdForTx)
          )}`,
          {
            headers: {
              "x-session-token": sToken,
              Authorization: `Bearer ${iToken}`,
              "x-tenant-id": tenantSafe,
            },
          }
        );

        const dataTx = await respTx.json().catch(() => ({}));
        if (respTx.ok && dataTx?.ok && Array.isArray(dataTx.items)) {
          setTxs(dataTx.items);
        } else {
          setTxs([]);
        }
      } finally {
        setTxsLoading(false);
      }
    },
    [tenantSafe]
  );

  // ================= CARGAR ACTIVO + HISTÓRICO + CUSTOM FIELDS =================
  useEffect(() => {
    const load = async () => {
      try {
        setAssetLoading(true);
        setAssetError(null);

        const sToken = localStorage.getItem("cloudSessionToken");
        const iToken = localStorage.getItem("cloudIdToken");

        if (!sToken || !iToken) {
          setAssetError("Sesión inválida, inicia sesión de nuevo.");
          setAsset(null);
          return;
        }

        // 0) Custom fields
        await fetchCustomFields(String(tenantSafe), sToken, iToken);

        // 1) Detalle del activo
        const resp = await fetch(
          `/api/cloud/assets/one?id=${encodeURIComponent(id)}&tenantId=${encodeURIComponent(
            tenantSafe
          )}`,
          {
            headers: {
              "x-session-token": sToken,
              Authorization: `Bearer ${iToken}`,
              "x-tenant-id": tenantSafe,
            },
          }
        );

        const data = await resp.json().catch(() => null as any);

        if (!resp.ok || !data?.ok || !data.asset) {
          setAssetError(data?.error || "Activo no encontrado");
          setAsset(null);
          return;
        }

        const a: ApiAsset = data.asset;
        setAsset(a);
        setAssetError(null);

        // ✅ Inicializa el formulario editable (RESUMEN)
        setEditTag(pickAssetTag(a, id));
        setEditType(pickAssetType(a));
        setEditLocationText(pickAssetLocation(a));

        // ✅ Inicializa custom editable
        const baseCustom = a.custom && typeof a.custom === "object" ? a.custom : {};
        setEditCustom(filterOutHiddenCustom(baseCustom));

        // 2) Histórico (carga inicial)
        const assetIdForTx = a._id || a.id || a.AssetTag || a.tag || id;
        await fetchTxsByAsset(String(assetIdForTx));
      } catch (err: any) {
        console.error("Error cargando detalle de activo:", err);
        setAssetError(err.message || "Error cargando activo");
        setAsset(null);
      } finally {
        setAssetLoading(false);
      }
    };

    if (!id) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, tenantSafe, filterOutHiddenCustom, fetchTxsByAsset]);

  // ✅ Asegura llaves en editCustom (sin pisar valores)
  // ⚠️ Usa customFieldsForForms (incluye ciclosLavado) y respeta ocultos
  useEffect(() => {
    if (!customFieldsForForms || customFieldsForForms.length === 0) return;

    setEditCustom((prev) => {
      const next = { ...(prev || {}) };
      for (const cf of customFieldsForForms) {
        if (!cf?.key) continue;
        if (isHiddenCustom(cf.key)) continue;
        if (Object.prototype.hasOwnProperty.call(next, cf.key)) continue;

        const t = normalizeCustomFieldType(cf.type);
        if (t === "boolean") next[cf.key] = false;
        else next[cf.key] = "";
      }
      return next;
    });
  }, [customFieldsForForms, isHiddenCustom]);

  // ✅ Si cambias ocultos, limpia editCustom de esos keys para que “se oculte en todo”
  useEffect(() => {
    setEditCustom((prev) => filterOutHiddenCustom(prev || {}));
  }, [hiddenCustomKeys, filterOutHiddenCustom]);

  // ✅ Cargar ubicaciones SOLO cuando entras a Movimiento o Histórico (para mostrar nombre)
  useEffect(() => {
    const run = async () => {
      if (tab !== "movimiento" && tab !== "historico") return;
      if (locationsLoading) return;
      if (locations.length > 0) return;

      const sToken = localStorage.getItem("cloudSessionToken");
      const iToken = localStorage.getItem("cloudIdToken");
      if (!sToken || !iToken) return;

      await fetchLocations(String(tenantSafe), sToken, iToken);
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // ✅ REFRESCAR histórico al entrar a la pestaña “Histórico”
  useEffect(() => {
    const run = async () => {
      if (tab !== "historico") return;
      if (!asset) return;

      const assetIdForTx = asset._id || asset.id || asset.AssetTag || asset.tag || id;
      await fetchTxsByAsset(String(assetIdForTx));
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // ============== GUARDAR RESUMEN ==============

  const handleGuardarResumen = async () => {
    try {
      const sToken = localStorage.getItem("cloudSessionToken");
      const iToken = localStorage.getItem("cloudIdToken");

      if (!sToken || !iToken || !asset) {
        alert("Sesión inválida o activo no cargado.");
        return;
      }

      if (!editTag.trim() || !editType.trim() || !editLocationText.trim()) {
        alert("RFID, Nombre de activo y Ubicación son obligatorios.");
        return;
      }

      setSavingResumen(true);

      // ✅ oculto = no se manda al backend
      const visibleCustomOnly = filterOutHiddenCustom(editCustom || {});
      // ✅ sanitiza usando defs del formulario (incluye ciclosLavado)
      const customClean = sanitizeCustom(customFieldsForForms || [], visibleCustomOnly);

      const payloadItem: any = {
        _id: displayDocId,
        merge: true,

        tag: editTag.trim(),
        AssetTag: editTag.trim(),

        type: editType.trim(),
        AssetType: editType.trim(),

        locationId: editLocationText.trim(),
        Location: editLocationText.trim(),

        custom: customClean,
      };

      const resp = await fetch("/api/cloud/assets/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-token": sToken,
          Authorization: `Bearer ${iToken}`,
          "x-tenant-id": tenantSafe,
        },
        body: JSON.stringify({ items: [payloadItem] }),
      });

      const data = await resp.json().catch(() => null as any);
      if (!resp.ok || !data?.ok) {
        throw new Error(data?.error || "Error guardando cambios");
      }

      // refresca detalle
      const respOne = await fetch(
        `/api/cloud/assets/one?id=${encodeURIComponent(displayDocId)}&tenantId=${encodeURIComponent(
          tenantSafe
        )}`,
        {
          headers: {
            "x-session-token": sToken,
            Authorization: `Bearer ${iToken}`,
            "x-tenant-id": tenantSafe,
          },
        }
      );

      const oneData = await respOne.json().catch(() => null as any);
      if (respOne.ok && oneData?.ok && oneData.asset) {
        setAsset(oneData.asset);

        const nextCustom =
          oneData.asset.custom && typeof oneData.asset.custom === "object"
            ? oneData.asset.custom
            : {};
        setEditCustom(filterOutHiddenCustom(nextCustom));
      }

      alert("Cambios guardados.");
    } catch (err: any) {
      console.error("Error guardando resumen:", err);
      alert(err.message || "Error guardando cambios");
    } finally {
      setSavingResumen(false);
    }
  };

  // ============== MOVIMIENTO MANUAL (NO QUITAR LO FUNCIONAL) ==============

  const handleGuardarMovimiento = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const sToken = localStorage.getItem("cloudSessionToken");
      const iToken = localStorage.getItem("cloudIdToken");

      if (!sToken || !iToken) {
        alert("Sesión inválida, vuelve a iniciar sesión.");
        return;
      }

      if (!movTipo) {
        alert("Selecciona Entrada o Salida.");
        return;
      }

      if (!movUbicacionId.trim()) {
        alert("Selecciona una ubicación (real).");
        return;
      }

      const tagToUse = (editTag || displayEpc).trim();
      if (!tagToUse) {
        alert("El activo no tiene RFID/tag.");
        return;
      }

      const resp = await fetch(`/api/cloud/check?tenantId=${encodeURIComponent(tenantSafe)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-token": sToken,
          Authorization: `Bearer ${iToken}`,
          "x-tenant-id": tenantSafe,
        },
        body: JSON.stringify({
          mode: movTipo,
          location_id: movUbicacionId.trim(),
          locationId: movUbicacionId.trim(),
          tag: tagToUse,
          notes: movNotas,
        }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data?.ok) {
        throw new Error(data?.error || "Error registrando movimiento");
      }

      // ✅ refresca activo
      const respOne = await fetch(
        `/api/cloud/assets/one?id=${encodeURIComponent(displayDocId)}&tenantId=${encodeURIComponent(
          tenantSafe
        )}`,
        {
          headers: {
            "x-session-token": sToken,
            Authorization: `Bearer ${iToken}`,
            "x-tenant-id": tenantSafe,
          },
        }
      );
      const oneData = await respOne.json().catch(() => ({}));
      const nextAsset: ApiAsset | null =
        respOne.ok && oneData?.ok && oneData.asset ? oneData.asset : null;

      if (nextAsset) {
        setAsset(nextAsset);

        // refresca inputs resumen con lo que venga del backend
        setEditTag(pickAssetTag(nextAsset, id));
        setEditType(pickAssetType(nextAsset));
        setEditLocationText(pickAssetLocation(nextAsset));

        const nextCustom =
          nextAsset.custom && typeof nextAsset.custom === "object" ? nextAsset.custom : {};
        setEditCustom(filterOutHiddenCustom(nextCustom));
      }

      // ✅ refresca histórico con ID correcto
      const assetIdForTx =
        (nextAsset?._id || nextAsset?.id || nextAsset?.AssetTag || nextAsset?.tag) ||
        (asset?._id || asset?.id || asset?.AssetTag || asset?.tag) ||
        id;

      await fetchTxsByAsset(String(assetIdForTx));

      alert("Movimiento registrado.");

      // No borramos ubicación para repetir rápido
      setMovTipo("");
      setMovNotas("");
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Error registrando movimiento");
    }
  };

  // Render inputs de custom fields
  const renderCustomFieldInput = (cf: AssetCustomFieldDef) => {
    const t = normalizeCustomFieldType(cf.type);
    const disabled = Boolean(cf.readOnly);

    const value = Object.prototype.hasOwnProperty.call(editCustom, cf.key)
      ? editCustom[cf.key]
      : t === "boolean"
      ? false
      : "";

    if (t === "boolean") {
      return (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={Boolean(value)}
            disabled={disabled}
            onChange={(e) =>
              setEditCustom((prev) => ({ ...(prev || {}), [cf.key]: e.target.checked }))
            }
          />
          <span className="text-xs text-neutral-600">{Boolean(value) ? "Sí" : "No"}</span>
        </div>
      );
    }

    if (t === "date") {
      return (
        <Input
          type="date"
          disabled={disabled}
          value={typeof value === "string" ? value : ""}
          onChange={(e) =>
            setEditCustom((prev) => ({ ...(prev || {}), [cf.key]: e.target.value }))
          }
        />
      );
    }

    if (t === "number") {
      return (
        <Input
          type="number"
          disabled={disabled}
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(e) =>
            setEditCustom((prev) => ({ ...(prev || {}), [cf.key]: e.target.value }))
          }
          placeholder={`Escribe ${cf.label || cf.key}`}
        />
      );
    }

    return (
      <Input
        type="text"
        disabled={disabled}
        value={typeof value === "string" ? value : String(value ?? "")}
        onChange={(e) =>
          setEditCustom((prev) => ({ ...(prev || {}), [cf.key]: e.target.value }))
        }
        placeholder={`Escribe ${cf.label || cf.key}`}
      />
    );
  };

  // =================== UI Historico (cards) ===================

  const HistoricoCards = () => {
    if (txsLoading) {
      return <div className="text-sm text-neutral-500">Cargando histórico…</div>;
    }

    if (!txsLoading && txs.length === 0) {
      return (
        <div className="text-sm text-neutral-500">
          Aún no hay transacciones registradas para este activo.
        </div>
      );
    }

    const items = [...txs].sort((a, b) => {
      const ta = typeof a.time === "number" ? a.time : 0;
      const tb = typeof b.time === "number" ? b.time : 0;
      return tb - ta; // más reciente primero
    });

    return (
      <div className="space-y-3">
        {items.map((t, idx) => {
          const ui = modeToUi(t.mode);
          const empleado = t.byName || t.byEmail || "—";
          const fecha = safeDateTimeFromSeconds(t.time);
          const etiqueta = t.assetCode || displayEpc || "—";
          const ubicacion = resolveLocationLabel(t.locationId);
          const nombreActivo = t.assetType || displayNombreActivo || "—";
          const notas = (t.notes || "").toString().trim();

          return (
            <div
              key={t.id || `${idx}`}
              className="rounded-xl border bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant={ui.variant}>{ui.label}</Badge>
                  <span className="text-xs text-neutral-500">{fecha}</span>
                </div>

                <div className="text-xs text-neutral-500">
                  Empleado: <span className="text-neutral-800">{empleado}</span>
                </div>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <div className="space-y-1">
                  <div className="text-[11px] uppercase tracking-wide text-neutral-500">
                    Etiqueta
                  </div>
                  <div className="font-mono text-xs text-neutral-900 break-all">
                    {etiqueta}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-[11px] uppercase tracking-wide text-neutral-500">
                    Ubicación
                  </div>
                  <div className="text-sm text-neutral-900">{ubicacion}</div>
                </div>

                <div className="space-y-1">
                  <div className="text-[11px] uppercase tracking-wide text-neutral-500">
                    Activo
                  </div>
                  <div className="text-sm text-neutral-900">{nombreActivo}</div>
                </div>
              </div>

              {notas ? (
                <div className="mt-3 rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
                  <span className="text-xs font-semibold text-neutral-600">Notas: </span>
                  {notas}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  };

  // =================== RENDER ===================

  return (
    <div className="min-h-screen w-full bg-neutral-50 text-neutral-900">
      <AppHeader />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        {assetError && !asset && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {assetError}
          </div>
        )}

        <div>
          <Button asChild variant="outline" className="px-5 py-2">
            <Link href={`${base}/activos`}>← Regresar a administrar activos</Link>
          </Button>
        </div>

        <section className="space-y-1">
          <h1 className="text-lg font-semibold">
            Detalle de activo{" "}
            <span className="align-middle text-sm text-neutral-500">({id})</span>
          </h1>
        </section>

        <Card>
          <CardHeader className="border-b bg-neutral-50">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">{displayNombreActivo || "ACTIVO"}</CardTitle>
                <div className="mt-1 text-xs text-neutral-500">
                  RFID: <span className="font-mono">{displayEpc}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant="outline">{displayUbicacion}</Badge>
                <Badge variant={badgeVariant}>{displayEstado}</Badge>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={tab === "resumen" ? "default" : "outline"}
                onClick={() => setTab("resumen")}
              >
                Resumen
              </Button>
              <Button
                size="sm"
                variant={tab === "historico" ? "default" : "outline"}
                onClick={() => setTab("historico")}
              >
                Histórico
              </Button>
              <Button
                size="sm"
                variant={tab === "movimiento" ? "default" : "outline"}
                onClick={() => setTab("movimiento")}
              >
                Movimiento manual
              </Button>
            </div>
          </CardHeader>

          <CardContent className="pt-6">
            {assetLoading && (
              <div className="pb-4 text-sm text-neutral-500">Cargando activo…</div>
            )}

            {/* ========= TAB: RESUMEN ========= */}
            {tab === "resumen" && !assetLoading && (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs text-neutral-500">Número RFID</label>
                    <Input value={editTag} onChange={(e) => setEditTag(e.target.value)} />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-neutral-500">Nombre del activo</label>
                    <Input value={editType} onChange={(e) => setEditType(e.target.value)} />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-neutral-500">Nombre de la ubicación</label>
                    <Input
                      value={editLocationText}
                      onChange={(e) => setEditLocationText(e.target.value)}
                    />
                  </div>
                </div>

                <div className="mt-4 rounded-md border bg-neutral-50 px-4 py-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold">Campos personalizados</h2>
                    {customFieldsError ? (
                      <span className="text-xs text-amber-700">{customFieldsError}</span>
                    ) : null}
                  </div>

                  {customFieldsForForms.filter((cf) => cf?.key && !isHiddenCustom(cf.key)).length ===
                  0 ? (
                    <div className="text-xs text-neutral-600">
                      No hay campos personalizados configurados (o están ocultos) para Activos.
                    </div>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      {customFieldsForForms
                        .filter((cf) => cf?.key && !isHiddenCustom(cf.key))
                        .map((cf) => (
                          <div key={cf.key} className="space-y-1">
                            <div className="text-xs text-neutral-600">
                              {cf.label || cf.key}
                              {cf.readOnly ? (
                                <span className="ml-2 rounded bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-600">
                                  Solo lectura
                                </span>
                              ) : null}
                            </div>
                            {renderCustomFieldInput(cf)}
                          </div>
                        ))}
                    </div>
                  )}

                  <div className="mt-4 flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditTag(pickAssetTag(asset, id));
                        setEditType(pickAssetType(asset));
                        setEditLocationText(pickAssetLocation(asset));

                        const baseCustom =
                          asset?.custom && typeof asset.custom === "object" ? asset.custom : {};
                        setEditCustom(filterOutHiddenCustom(baseCustom));
                      }}
                      disabled={savingResumen}
                    >
                      Revertir
                    </Button>

                    <Button size="sm" onClick={handleGuardarResumen} disabled={savingResumen}>
                      {savingResumen ? "Guardando..." : "Guardar"}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* ========= TAB: HISTÓRICO ========= */}
            {tab === "historico" && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm text-neutral-600">Transacciones Recientes.</p>
                  </div>
                </div>

                <HistoricoCards />
              </div>
            )}

            {/* ========= TAB: MOVIMIENTO MANUAL ========= */}
            {tab === "movimiento" && (
              <form className="space-y-6" onSubmit={handleGuardarMovimiento}>
                {locationsError && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    {locationsError}
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Movimiento</label>
                    <Select value={movTipo} onValueChange={(v: "in" | "out") => setMovTipo(v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="in">Entrada</SelectItem>
                        <SelectItem value="out">Salida</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium">Ubicación</label>

                    <Select value={movUbicacionId} onValueChange={setMovUbicacionId}>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            locationsLoading
                              ? "Cargando ubicaciones..."
                              : "Selecciona ubicación"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {locationsLoading ? (
                          <div className="px-3 py-2 text-sm text-neutral-500">Cargando…</div>
                        ) : locations.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-neutral-500">
                            No hay ubicaciones para mostrar.
                          </div>
                        ) : (
                          locations.map((loc) => (
                            <SelectItem key={loc.id} value={loc.id}>
                              {loc.label}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium">Notas</label>
                  <textarea
                    className="min-h-[120px] w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
                    placeholder="Describe el motivo del movimiento manual, responsable, referencia, etc."
                    value={movNotas}
                    onChange={(e) => setMovNotas(e.target.value)}
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setMovTipo("");
                      setMovUbicacionId("");
                      setMovNotas("");
                    }}
                  >
                    Limpiar
                  </Button>
                  <Button type="submit">Guardar movimiento</Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        <div className="pt-4 text-center text-xs text-neutral-500">
          © 2025 · Dashboard Cloud API
        </div>
      </main>
    </div>
  );
}
