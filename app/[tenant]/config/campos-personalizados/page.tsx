"use client";

import React, { useState } from "react";
import { AppHeader } from "@/components/app-header";
import { useTenant } from "@/components/tenant-context";
import { usePathname } from "next/navigation";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type CustomFieldType = "text" | "number" | "date" | "boolean";

export default function CamposPersonalizadosPage() {
  const tenantFromContext = useTenant() as string | undefined;
  const pathname = usePathname();
  const tenantFromPath =
    pathname && pathname.split("/").filter(Boolean)[0]
      ? pathname.split("/").filter(Boolean)[0]
      : undefined;

  // 👇 extra: fallback al tenant guardado en login
  const tenantFromStorage =
    typeof window !== "undefined"
      ? window.localStorage.getItem("cloudTenantId") || undefined
      : undefined;

  const tenantId =
    tenantFromContext || tenantFromPath || tenantFromStorage || "";

  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [type, setType] = useState<CustomFieldType>("number");
  const [readOnly, setReadOnly] = useState(false);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!tenantId) {
      setErrorMsg(
        "No se pudo determinar el tenantId. Revisa que la URL sea /[tenant]/config/campos-personalizados."
      );
      return;
    }

    const sessionToken =
      typeof window !== "undefined"
        ? window.localStorage.getItem("cloudSessionToken")
        : null;

    const idToken =
      typeof window !== "undefined"
        ? window.localStorage.getItem("cloudIdToken")
        : null;

    if (!sessionToken || !idToken) {
      setErrorMsg(
        "No se encontró sessionToken o idToken de Firebase. Intenta volver a iniciar sesión en el dashboard."
      );
      return;
    }

    setSaving(true);

    try {
      const res = await fetch("/api/cloud/custom-fields", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
          "x-session-token": sessionToken,
          "x-tenant-id": String(tenantId),
        },
        body: JSON.stringify({
          tenantId,
          label: label.trim(),
          key: key.trim(),
          type,
          readOnly,
          scope: "asset",
        }),
      });

      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text };
      }

      if (!res.ok || data.ok === false) {
        console.error("Error al crear campo (Next → Cloud):", {
          status: res.status,
          data,
        });
        const msg =
          data.error ||
          data.message ||
          data.raw ||
          `Error HTTP ${res.status} al crear el campo.`;
        setErrorMsg(msg);
        return;
      }

      setSuccessMsg("Campo personalizado creado correctamente.");
      setLabel("");
      setKey("");
      setType("number");
      setReadOnly(false);
    } catch (err) {
      console.error("Error de red al crear el campo:", err);
      setErrorMsg("Error de red al crear el campo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />

      <main className="container mx-auto max-w-4xl py-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Alta de campos personalizados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Nombre visible */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Nombre del campo 
                </label>
                <Input
                  required
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Ej: Nombre Para Mostrar"
                />
              </div>

              {/* Clave interna */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Clave interna (sin espacios)
                </label>
                <Input
                  required
                  value={key}
                  onChange={(e) =>
                    setKey(
                      e.target.value
                        .normalize("NFD")
                        .replace(/[\u0300-\u036f]/g, "")
                        .replace(/\s+/g, "")
                    )
                  }
                  placeholder="Ej: NombreParaMostrar"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                </p>
              </div>

              {/* Tipo */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Tipo de dato
                </label>
                <Select
                  value={type}
                  onValueChange={(v) => setType(v as CustomFieldType)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="number">Número</SelectItem>
                    <SelectItem value="text">Texto</SelectItem>
                    <SelectItem value="date">Fecha</SelectItem>
                    <SelectItem value="boolean">Sí / No</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Solo lectura */}
              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={readOnly}
                    onChange={(e) => setReadOnly(e.target.checked)}
                  />
                  Solo lectura (lo actualiza el sistema / API)
                </label>

                <Button type="submit" disabled={saving}>
                  {saving ? "Guardando..." : "Guardar campo"}
                </Button>
              </div>
            </form>

            {errorMsg && (
              <p className="text-sm text-red-600 mt-2">{errorMsg}</p>
            )}
            {successMsg && (
              <p className="text-sm text-emerald-600 mt-2">{successMsg}</p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
