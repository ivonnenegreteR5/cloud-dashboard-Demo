"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { useTenant } from "@/components/tenant-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Asset {
  id?: string;
  _id?: string;
  AssetTag?: string;
  AssetType?: string;
  Location?: string;
  locationId?: string;
  Status?: string;
  status?: string;
  ts?: number;
  Created?: number;
  LastSeen?: number;
  updatedAt?: number;
  PersonnelName?: string;
  raw?: any;
  custom?: Record<string, any>;
  [key: string]: any;
}

interface AssetCustomFieldDef {
  key: string;
  label: string;
  type?: string;
  readOnly?: boolean;
}

// ✅ FIX: formatear Unix con zona horaria fija (evita +1h del navegador)
const FIXED_TIMEZONE = "America/Mexico_City";

function normalizeEpochSeconds(ts: any): number | null {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return null;

  // si viene en milisegundos (13 dígitos), lo convertimos
  if (n > 1e12) return Math.floor(n / 1000);

  // si viene en segundos (10 dígitos aprox), lo dejamos
  return Math.floor(n);
}

function formatUnix(tsSecAny: any): string {
  const sec = normalizeEpochSeconds(tsSecAny);
  if (!sec) return "-";

  const d = new Date(sec * 1000);

  return new Intl.DateTimeFormat("es-MX", {
    timeZone: FIXED_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(d);
}

export default function DashboardHome() {
  const router = useRouter();

  const tenantFromContext = useTenant() as string | undefined;

  const tenantForCustomFields =
    tenantFromContext && tenantFromContext.trim().length > 0
      ? tenantFromContext
      : "demo";

  const [assets, setAssets] = useState<Asset[]>([]);
  const [totalActivos, setTotalActivos] = useState<number>(0);

  const [customFieldsFromApi, setCustomFieldsFromApi] = useState<
    AssetCustomFieldDef[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customFieldsError, setCustomFieldsError] = useState<string | null>(
    null
  );

  const [pageSize, setPageSize] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const totalPages =
    totalActivos > 0 ? Math.max(1, Math.ceil(totalActivos / pageSize)) : 1;

  const safePage = Math.min(currentPage, totalPages);
  const skip = (safePage - 1) * pageSize;

  useEffect(() => {
    const sessionToken =
      typeof window !== "undefined"
        ? window.localStorage.getItem("cloudSessionToken")
        : null;
    const idToken =
      typeof window !== "undefined"
        ? window.localStorage.getItem("cloudIdToken")
        : null;

    if (!sessionToken || !idToken) {
      router.push("/login");
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        setCustomFieldsError(null);

        const headers: Record<string, string> = {
          "x-session-token": sessionToken,
          Authorization: `Bearer ${idToken}`,
        };
        if (tenantFromContext) headers["x-tenant-id"] = tenantFromContext;

        // 1) Assets
        const resp = await fetch(
          `/api/cloud/assets?limit=${pageSize}&skip=${skip}`,
          { headers }
        );
        const data = await resp.json();

        if (!resp.ok || data.ok === false) {
          throw new Error(data.error || "Error cargando activos");
        }

        setAssets(data.assets || []);
        setTotalActivos(
          typeof data.total === "number"
            ? data.total
            : (data.assets || []).length
        );

        // 2) Campos personalizados
        try {
          const cfResp = await fetch(
            `/api/cloud/custom-fields?tenantId=${encodeURIComponent(
              tenantForCustomFields
            )}`,
            { headers }
          );

          const cfText = await cfResp.text();
          let cfData: any = {};

          try {
            cfData = cfText ? JSON.parse(cfText) : {};
          } catch (parseErr) {
            console.error(
              "[DashboardHome] custom-fields no devolvió JSON válido. Inicio:",
              cfText.slice(0, 200)
            );
            setCustomFieldsError(
              "La ruta /api/cloud/custom-fields no devolvió JSON válido (revisa logs del servidor)."
            );
            setCustomFieldsFromApi([]);
            return;
          }

          console.log("[DashboardHome] custom-fields respuesta:", cfData);

          if (!cfResp.ok || cfData.ok === false) {
            setCustomFieldsError(
              cfData.error || "Error cargando campos personalizados"
            );
            setCustomFieldsFromApi([]);
          } else {
            setCustomFieldsFromApi(cfData.items || []);
          }
        } catch (e: any) {
          console.error("Error cargando custom fields:", e);
          setCustomFieldsError(
            e?.message || "Error cargando campos personalizados"
          );
          setCustomFieldsFromApi([]);
        }
      } catch (err: any) {
        console.error("Error cargando assets:", err);
        setError(err.message || "Error al cargar activos");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [
    router,
    tenantFromContext,
    tenantForCustomFields,
    pageSize,
    safePage,
    skip,
  ]);

  useEffect(() => {
    setCurrentPage(1);
  }, [pageSize]);

  const handlePrevPage = () => {
    setCurrentPage((p) => Math.max(1, p - 1));
  };

  const handleNextPage = () => {
    setCurrentPage((p) => Math.min(totalPages, p + 1));
  };

  const fromRow = totalActivos === 0 ? 0 : skip + 1;
  const toRow = Math.min(skip + pageSize, totalActivos);

  const allCustomFields: AssetCustomFieldDef[] = useMemo(() => {
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

    for (const a of assets || []) {
      const c =
        (a && a.custom) ||
        (a && a.raw && (a.raw.custom as Record<string, any>)) ||
        null;
      if (!c || typeof c !== "object") continue;

      for (const k of Object.keys(c)) {
        if (!map.has(k)) {
          map.set(k, {
            key: k,
            label: k,
          });
        }
      }
    }

    console.log(
      "[DashboardHome] allCustomFields construidos:",
      Array.from(map.values())
    );

    return Array.from(map.values());
  }, [assets, customFieldsFromApi]);

  return (
    <div className="min-h-screen w-full bg-neutral-50 text-neutral-900">
      <AppHeader />

      <div className="mx-auto max-w-7xl px-4 py-6">
        {/* Total de activos */}
        <div className="mb-6 rounded-md border bg-white px-6 py-5 text-center shadow-sm">
          <div className="text-xl font-semibold">Total de Activos</div>

          {loading && totalActivos === 0 ? (
            <div className="mt-2 text-3xl font-bold">Cargando…</div>
          ) : (
            <div className="mt-2 text-3xl font-bold">{totalActivos}</div>
          )}

          <div className="mt-1 text-sm text-neutral-600">
            Total de activos registrados.
          </div>

          {error && (
            <div className="mt-2 text-xs text-red-500">{error}</div>
          )}
          {customFieldsError && (
            <div className="mt-1 text-[11px] text-amber-600">
              {customFieldsError}
            </div>
          )}

          {false && (
            <pre className="mt-2 max-h-32 overflow-auto rounded bg-neutral-100 p-2 text-left text-[10px] text-neutral-700">
              {JSON.stringify(
                { customFieldsFromApi: customFieldsFromApi.slice(0, 3) },
                null,
                2
              )}
            </pre>
          )}
        </div>

        <h2 className="mb-3 text-lg font-semibold">Activos</h2>

        <Card className="mt-1">
          <CardHeader>
            <CardTitle className="text-base">Listado de activos</CardTitle>
          </CardHeader>

          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-600">
                    <th className="py-2 pr-4">Estado</th>
                    <th className="py-2 pr-4">Nombre Ubicación</th>
                    <th className="py-2 pr-4">Nombre de Activo</th>
                    <th className="py-2 pr-4">Número RFID</th>
                    <th className="py-2 pr-4">Empleado Nombre</th>
                    {/* 👉 Campos personalizados ANTES de Creado / Última vez vista */}
                    {allCustomFields.map((cf) => (
                      <th key={cf.key} className="py-2 pr-4">
                        {cf.label}
                      </th>
                    ))}
                    <th className="py-2 pr-4">Creado</th>
                    <th className="py-2 pr-4">Última vez vista</th>
                  </tr>
                </thead>

                <tbody>
                  {loading && assets.length === 0 && (
                    <tr>
                      <td
                        colSpan={7 + allCustomFields.length}
                        className="py-6 text-center"
                      >
                        Cargando activos…
                      </td>
                    </tr>
                  )}

                  {!loading && assets.length === 0 && !error && (
                    <tr>
                      <td
                        colSpan={7 + allCustomFields.length}
                        className="py-6 text-center"
                      >
                        No hay activos registrados en la API.
                      </td>
                    </tr>
                  )}

                  {!loading &&
                    assets.map((a, idx) => {
                      const status =
                        a.status || a.Status || a.raw?.status || "";

                      const tag =
                        a.AssetTag ||
                        a.tag ||
                        a.code ||
                        a.raw?.AssetTag ||
                        a.raw?.tag ||
                        "-";

                      const type =
                        a.AssetType ||
                        a.type ||
                        a.raw?.AssetType ||
                        a.raw?.type ||
                        "-";

                      const loc =
                        a.Location ||
                        a.locationId ||
                        a.raw?.Location ||
                        "-";

                      const createdTs =
                        a.Created || a.ts || a.raw?.Created || a.raw?.ts;
                      const lastSeenTs =
                        a.LastSeen ||
                        a.updatedAt ||
                        a.raw?.LastSeen ||
                        a.raw?.updatedAt;

                      // ✅ FIX: formateo consistente (timezone fija)
                      const created = formatUnix(createdTs);
                      const lastSeen = formatUnix(lastSeenTs);

                      const customFromAsset: Record<string, any> =
                        a.custom ||
                        (a.raw?.custom as Record<string, any>) ||
                        {};

                      return (
                        <tr
                          key={a._id || a.id || `${skip + idx}`}
                          className={`border-b ${
                            idx % 2 ? "bg-neutral-50" : "bg-white"
                          }`}
                        >
                          <td className="py-2 pr-4 align-top">
                            {(() => {
                              const raw = (status || "").toLowerCase();

                              const esEntrada =
                                raw === "in" ||
                                raw === "checked in" ||
                                raw === "entrada";

                              const esSalida =
                                raw === "out" ||
                                raw === "checked out" ||
                                raw === "salida";

                              const texto = esEntrada
                                ? "Entrada"
                                : esSalida
                                ? "Salida"
                                : status || "N/A";

                              return (
                                <span
                                  className={
                                    "px-4 py-1 text-xs font-semibold inline-block rounded-full " +
                                    (esEntrada
                                      ? "bg-black text-white"
                                      : "bg-neutral-100 text-neutral-600")
                                  }
                                >
                                  {texto}
                                </span>
                              );
                            })()}
                          </td>

                          <td className="py-2 pr-4 align-top">{loc}</td>
                          <td className="py-2 pr-4 align-top">{type}</td>
                          <td className="py-2 pr-4 align-top font-mono text-xs">
                            {tag}
                          </td>
                          <td className="py-2 pr-4 align-top text-xs">
                            {a.PersonnelName || a.raw?.PersonnelName || "-"}
                          </td>

                          {/* 👉 Valores de campos personalizados EN MEDIO */}
                          {allCustomFields.map((cf) => {
                            const rawVal = customFromAsset[cf.key];
                            const val =
                              rawVal === undefined || rawVal === null
                                ? "-"
                                : String(rawVal);
                            return (
                              <td
                                key={cf.key}
                                className="py-2 pr-4 align-top text-xs"
                              >
                                {val}
                              </td>
                            );
                          })}

                          <td className="py-2 pr-4 align-top text-xs">
                            {created}
                          </td>
                          <td className="py-2 pr-4 align-top text-xs">
                            {lastSeen}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            {/* Footer tabla */}
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-xs text-neutral-700">
              <div className="flex items-center gap-2">
                <span>Mostrar</span>
                <select
                  className="rounded-md border px-2 py-1 text-xs bg-white"
                  value={pageSize}
                  onChange={(e) =>
                    setPageSize(Number(e.target.value) || 50)
                  }
                >
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                  <option value={500}>500</option>
                </select>
                <span>registros por página</span>
              </div>

              <div className="flex items-center gap-3">
                <span>
                  Mostrando{" "}
                  <span className="font-semibold">{fromRow || 0}</span> -{" "}
                  <span className="font-semibold">{toRow || 0}</span> de{" "}
                  <span className="font-semibold">{totalActivos}</span> activos
                </span>

                <div className="flex items-center gap-1">
                  <button
                    onClick={handlePrevPage}
                    disabled={safePage <= 1}
                    className="inline-flex h-7 w-7 items-center justify-center rounded border bg-white disabled:opacity-40"
                    title="Página anterior"
                  >
                    <ChevronLeft className="h-3 w-3" />
                  </button>
                  <span>
                    Página{" "}
                    <span className="font-semibold">{safePage}</span> de{" "}
                    <span className="font-semibold">{totalPages}</span>
                  </span>
                  <button
                    onClick={handleNextPage}
                    disabled={safePage >= totalPages}
                    className="inline-flex h-7 w-7 items-center justify-center rounded border bg-white disabled:opacity-40"
                    title="Página siguiente"
                  >
                    <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <footer className="mx-auto max-w-7xl px-4 pb-8 pt-4 text-center text-xs text-neutral-500">
        © 2025 · Dashboard demo
      </footer>
    </div>
  );
}
