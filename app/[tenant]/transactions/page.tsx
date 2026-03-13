"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTenant } from "@/components/tenant-context";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface CloudTransaction {
  id?: string;
  assetId?: string;
  locationId?: string;
  mode?: string; // "in" | "out"
  time?: number | string;
  byUid?: string;
  byEmail?: string;
  byName?: string;
  personnelName?: string;
  personnelLocation?: string;
  assetType?: string;
  assetCode?: string;
  raw?: any;
  [key: string]: any;
}

export default function TransactionsPage() {
  const tenantId = useTenant();
  const router = useRouter();

  const [items, setItems] = useState<CloudTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sToken = localStorage.getItem("cloudSessionToken");
    const iToken = localStorage.getItem("cloudIdToken");

    if (!sToken || !iToken) {
      router.push("/login");
      return;
    }

    const fetchTx = async () => {
      try {
        setLoading(true);
        setError(null);

        const resp = await fetch("/api/cloud/transactions?limit=1000", {
          headers: {
            "x-session-token": sToken,
            Authorization: `Bearer ${iToken}`,
            "x-tenant-id": tenantId,
          },
        });

        const data = await resp.json();

        if (!resp.ok || !data.ok) {
          throw new Error(data.error || "Error cargando transacciones");
        }

        setItems((data.transactions || []) as CloudTransaction[]);
      } catch (err: any) {
        console.error("Error cargando transacciones:", err);
        setError(err.message || "Error cargando transacciones");
      } finally {
        setLoading(false);
      }
    };

    fetchTx();
  }, [router, tenantId]);

  const rows = useMemo(() => {
    return (items || []).map((t) => {
      const modeRaw =
        (t.mode || t.raw?.mode || "").toString().toLowerCase();

      const tipo =
        modeRaw === "in"
          ? "Entrada"
          : modeRaw === "out"
          ? "Salida"
          : t.mode || "N/A";

      const ubicacion =
        t.locationId ||
        t.raw?.location_id ||
        t.personnelLocation ||
        t.raw?.personnelLocation ||
        "-";

      const epc =
        t.assetCode ||
        t.raw?.assetCode ||
        t.raw?.AssetTag ||
        "-";

      const empleado =
        t.personnelName ||
        t.byName ||
        t.raw?.personnelName ||
        t.raw?.by_name ||
        "-";

      const timeVal =
        typeof t.time === "number"
          ? t.time
          : t.time
          ? Number(t.time)
          : t.raw?.time;

      const fecha =
        typeof timeVal === "number"
          ? new Date(
              (timeVal > 9999999999 ? timeVal * 1000 : timeVal * 1000)
            ).toLocaleString()
          : "-";

      return { tipo, ubicacion, epc, empleado, fecha };
    });
  }, [items]);

  const total = rows.length;
  const totalIn = rows.filter((r) => r.tipo === "Entrada").length;
  const totalOut = rows.filter((r) => r.tipo === "Salida").length;

  return (
    <div className="min-h-screen w-full bg-neutral-50 text-neutral-900">
      <AppHeader />

      <div className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        {/* Botón regresar */}
        <div>
          <Button asChild variant="outline" className="px-5 py-2">
            <Link href={`/${tenantId}`}>
              ← Regresar a pantalla principal
            </Link>
          </Button>
        </div>

        {/* Título */}
        <h2 className="text-lg font-semibold">Transacciones</h2>

        {/* Summary */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="py-4">
              <div className="text-xs font-semibold uppercase text-neutral-500">
                TOTAL TRANSACCIONES
              </div>
              <div className="mt-2 text-3xl font-bold">
                {loading ? "…" : total}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-4">
              <div className="text-xs font-semibold uppercase text-neutral-500">
                ENTRADAS (check in)
              </div>
              <div className="mt-2 text-3xl font-bold">
                {loading ? "…" : totalIn}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-4">
              <div className="text-xs font-semibold uppercase text-neutral-500">
                SALIDAS (check out)
              </div>
              <div className="mt-2 text-3xl font-bold">
                {loading ? "…" : totalOut}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabla */}
        <Card>
          <CardHeader>
            <CardTitle>Transacciones (Entradas / Salidas)</CardTitle>
          </CardHeader>

          <CardContent>
            {error && (
              <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">
                {error}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-600">
                    <th className="py-2 pr-4">Tipo</th>
                    <th className="py-2 pr-4">Ubicación</th>
                    <th className="py-2 pr-4">Etiqueta (EPC)</th>
                    <th className="py-2 pr-4">Empleado</th>
                    <th className="py-2 pr-4">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center">
                        Cargando transacciones…
                      </td>
                    </tr>
                  )}

                  {!loading && rows.length === 0 && !error && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center">
                        No hay transacciones registradas.
                      </td>
                    </tr>
                  )}

                  {!loading &&
                    rows.map((t, idx) => (
                      <tr
                        key={idx}
                        className={`border-b ${
                          idx % 2 ? "bg-neutral-50" : "bg-white"
                        }`}
                      >
                        <td className="py-2 pr-4 align-top">
                          <Badge
                            variant={
                              t.tipo === "Entrada" ? "default" : "secondary"
                            }
                          >
                            {t.tipo}
                          </Badge>
                        </td>
                        <td className="py-2 pr-4 align-top">{t.ubicacion}</td>
                        <td className="py-2 pr-4 align-top font-mono text-xs">
                          {t.epc}
                        </td>
                        <td className="py-2 pr-4 align-top text-xs">
                          {t.empleado}
                        </td>
                        <td className="py-2 pr-4 align-top text-xs">
                          {t.fecha}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="pt-2 text-center text-xs text-neutral-500">
          © 2025 · Dashboard Cloud API
        </div>
      </div>
    </div>
  );
}
