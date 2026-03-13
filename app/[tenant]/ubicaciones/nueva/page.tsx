// app/[tenant]/ubicaciones/nueva/page.tsx
// app/[tenant]/ubicaciones/nueva/page.tsx
"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useTenant } from "@/components/tenant-context";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type UbicacionForm = {
  nombre: string;
  idUbicacion: string;
  descripcion: string;
};

function tenantFromPath(pathname: string | null) {
  if (!pathname) return "";
  const parts = pathname.split("/").filter(Boolean);
  return (parts[0] || "").trim();
}

export default function CrearUbicacionPage() {
  const router = useRouter();
  const pathname = usePathname();
  const tenantFromContext = (useTenant() as string) || "";

  // ✅ tenant final: context -> url -> localStorage (para que nunca sea vacío)
  const tenantId = useMemo(() => {
    const ctx = tenantFromContext.trim();
    if (ctx) return ctx;

    const fromUrl = tenantFromPath(pathname);
    if (fromUrl) return fromUrl;

    if (typeof window !== "undefined") {
      const stored =
        (localStorage.getItem("tenantId") ||
          localStorage.getItem("cloudTenantId") ||
          localStorage.getItem("tenant") ||
          "")?.trim();
      if (stored) return stored;
    }

    return "";
  }, [tenantFromContext, pathname]);

  const [form, setForm] = useState<UbicacionForm>({
    nombre: "",
    idUbicacion: "",
    descripcion: "",
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange =
    (field: keyof UbicacionForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };

  const resetForm = () => {
    setForm({
      nombre: "",
      idUbicacion: "",
      descripcion: "",
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!tenantId) {
      setError("Tenant no válido. Vuelve a iniciar sesión.");
      return;
    }

    const sessionToken = localStorage.getItem("cloudSessionToken");
    const idToken = localStorage.getItem("cloudIdToken");

    if (!sessionToken || !idToken) {
      setError("Sesión no válida, vuelve a iniciar sesión.");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const item = {
        id: form.idUbicacion.trim(),
        name: form.nombre.trim(),
        description: form.descripcion?.trim() || "",
        active: true,
      };

      const resp = await fetch("/api/cloud/locations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-token": sessionToken,
          Authorization: `Bearer ${idToken}`,
          "x-tenant-id": tenantId,
        },
       body: JSON.stringify({ tenantId, item }),

      });

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok || !data?.ok) {
        throw new Error(data?.error || "No se pudo guardar la ubicación");
      }

      // ✅ éxito → regresar a lista
      router.push(`/${tenantId}/ubicaciones`);
      router.refresh();
    } catch (err: any) {
      console.error("Error guardando ubicación:", err);
      setError(err?.message || "Error al guardar ubicación");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-neutral-50 text-neutral-900">
      <AppHeader />

      <main className="mx-auto max-w-3xl px-4 py-6 space-y-6">
        {/* Regresar */}
        <div>
          <Button asChild variant="outline" className="px-5 py-2">
            <Link href={`/${tenantId}/ubicaciones`}>← Regresar a ubicaciones</Link>
          </Button>
        </div>

        {/* Título */}
        <section className="space-y-1">
          <h1 className="text-lg font-semibold">Crear nueva ubicación</h1>
          <p className="text-sm text-neutral-600">
            Ingresa el nombre, el ID y una descripción (opcional).
          </p>
        </section>

        {/* Error */}
        {error && (
          <div className="rounded-md border bg-white px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Form */}
        <Card className="mt-2">
          <CardHeader>
            <CardTitle className="text-base">Datos de la ubicación</CardTitle>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid gap-4">
                {/* Nombre */}
                <div className="space-y-1">
                  <label className="text-sm font-medium">
                    Nombre de la ubicación
                  </label>
                  <Input
                    placeholder="Ej. Almacén central"
                    value={form.nombre}
                    onChange={handleChange("nombre")}
                    required
                    disabled={saving}
                  />
                  <p className="text-xs text-neutral-500">
                    Nombre descriptivo para identificar la ubicación.
                  </p>
                </div>

                {/* ID */}
                <div className="space-y-1">
                  <label className="text-sm font-medium">ID de la ubicación</label>
                  <Input
                    placeholder="Ej. ALM001"
                    value={form.idUbicacion}
                    onChange={handleChange("idUbicacion")}
                    required
                    disabled={saving}
                  />
                  <p className="text-xs text-neutral-500">
                    Código interno único (lo usarás para referenciarla).
                  </p>
                </div>

                {/* Descripción */}
                <div className="space-y-1">
                  <label className="text-sm font-medium">Descripción</label>
                  <textarea
                    className="min-h-[110px] w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 disabled:opacity-60"
                    placeholder="Ej. Ubicación principal para recepción y resguardo de activos."
                    value={form.descripcion}
                    onChange={handleChange("descripcion")}
                    disabled={saving}
                  />
                  <p className="text-xs text-neutral-500">
                    Opcional. Ayuda a dar contexto a la ubicación.
                  </p>
                </div>
              </div>

              {/* Botones */}
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetForm}
                  disabled={saving}
                >
                  Limpiar
                </Button>

                <Button type="submit" disabled={saving}>
                  {saving ? "Guardando..." : "Guardar ubicación"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="pt-4 text-center text-xs text-neutral-500">
          © 2025 · Dashboard Cloud API
        </div>
      </main>
    </div>
  );
}
