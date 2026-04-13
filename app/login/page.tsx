// app/login/page.tsx
"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff } from "lucide-react";

function extractTenantFromEmail(email: string): string {
  const [, domain] = (email || "").split("@");
  if (!domain) return "demo";
  const tenant = domain.split(".")[0];
  return tenant || "demo";
}

function cleanStr(v: any): string {
  const s = String(v ?? "").trim();
  if (!s || s === "undefined" || s === "null") return "";
  return s;
}

function saveTenantBranding(tenant: any) {
  try {
    const name = cleanStr(tenant?.name || tenant?.displayName);
    const logoUrl = cleanStr(tenant?.logoUrl);
    const theme = tenant?.theme && typeof tenant.theme === "object" ? tenant.theme : null;

    if (name) localStorage.setItem("cloudTenantName", name);
    if (logoUrl) localStorage.setItem("cloudTenantLogoUrl", logoUrl);

    if (theme) {
      localStorage.setItem("cloudTenantTheme", JSON.stringify(theme));
    } else {
      localStorage.removeItem("cloudTenantTheme");
    }
  } catch {
    // ignore
  }
}


function normalizeApps(raw: any): string[] {
  // Acepta:
  // - ["main","idlinens"]
  // - "main,idlinens"
  // - undefined -> []
  if (Array.isArray(raw)) return raw.map((x) => cleanStr(x)).filter(Boolean);

  if (typeof raw === "string") {
    return raw
      .split(",")
      .map((x) => cleanStr(x))
      .filter(Boolean);
  }

  return [];
}

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ✅ mostrar/ocultar contraseña
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  const saveBranding = (tenant: any) => {
    try {
      const name = cleanStr(tenant?.name || tenant?.displayName);
      const logoUrl = cleanStr(tenant?.logoUrl);
      const theme =
        tenant?.theme && typeof tenant.theme === "object" ? tenant.theme : null;

      if (name) localStorage.setItem("cloudTenantName", name);
      else localStorage.removeItem("cloudTenantName");

      if (logoUrl) localStorage.setItem("cloudTenantLogoUrl", logoUrl);
      else localStorage.removeItem("cloudTenantLogoUrl");

      if (theme) localStorage.setItem("cloudTenantTheme", JSON.stringify(theme));
      else localStorage.removeItem("cloudTenantTheme");
    } catch {
      // ignore
    }
  };

  try {
    setLoading(true);
    setError(null);

    // 1️⃣ Crear SessionToken de tu Cloud API usando SOLO email/password (como antes)
    const resp = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });

    const text = await resp.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (!resp.ok || !data?.ok) {
      const msg =
        data?.error || data?.message || data?.raw || "Error creando SessionToken";
      throw new Error(msg);
    }

    // ✅ SessionToken de tu Cloud API
    const sessionToken = cleanStr(data?.sessionToken);
    if (!sessionToken) throw new Error("La API no devolvió sessionToken");

    // ✅ idToken (JWT Firebase) — lo devuelve /api/auth/session
    const apiIdToken = cleanStr(data?.idToken);

    // ✅ Tenant/role desde tu API con fallback seguro
    const tenantIdFromApi =
      cleanStr(data?.user?.tenantId) || cleanStr(data?.tenantId);

    const tenantId = tenantIdFromApi || extractTenantFromEmail(email);

    const role = cleanStr(data?.user?.role) || "user";
    const isSuperAdmin =
      Boolean(data?.user?.isSuperAdmin) || role.toLowerCase() === "superadmin";

    // ✅ módulos/apps habilitadas (por tenant)
    const apps = normalizeApps(data?.apps);

    // Guardar en localStorage (mantiene lo ya funcional)
    if (apiIdToken) localStorage.setItem("cloudIdToken", apiIdToken);
    localStorage.setItem("cloudSessionToken", sessionToken);
    localStorage.setItem("cloudUserEmail", email);
    localStorage.setItem("cloudTenantId", tenantId);
    localStorage.setItem("cloudUserRole", role);
    localStorage.setItem("cloudIsSuperAdmin", isSuperAdmin ? "true" : "false");

    // ✅ guardar apps para que AppHeader muestre módulos
    localStorage.setItem("cloudApps", JSON.stringify(apps));

    // ✅ NUEVO: guardar branding si ya vino en la respuesta del login
    // (depende de cómo lo regreses en tu /api/v1/SessionToken)
    if (data?.tenant) {
      saveBranding(data.tenant);
    } else if (data?.tenantProfile) {
      saveBranding(data.tenantProfile);
    } else {
      // ✅ Fallback: pedir branding al endpoint Tenants/Me
      // Requiere que tengas creado app/api/tenants/me/route.ts
      try {
        if (apiIdToken) {
          const r = await fetch("/api/tenants/me", {
            method: "GET",
            headers: {
              Authorization: `Bearer ${apiIdToken}`,
              "x-session-token": sessionToken,
              // para usuario normal no es necesario, pero no estorba:
              "x-tenant-id": tenantId,
            },
            cache: "no-store",
          });

          const t = await r.text();
          let d: any = {};
          try {
            d = t ? JSON.parse(t) : {};
          } catch {
            d = { raw: t };
          }

          if (r.ok && d?.tenant) {
            saveBranding(d.tenant);

            // si el backend devuelve apps aquí, también las sincronizamos
            if (Array.isArray(d?.tenant?.apps)) {
              localStorage.setItem(
                "cloudApps",
                JSON.stringify(d.tenant.apps.map((x: any) => cleanStr(x)).filter(Boolean))
              );
            }
          }
        }
      } catch {
        // ignore
      }
    }

    // 2️⃣ Redirección:
    // - superadmin -> /superadmin (elige tenant)
    // - normal -> /[tenant]
    if (isSuperAdmin) {
      router.push("/superadmin");
    } else {
      router.push(`/${tenantId}`);
    }
  } catch (err: any) {
    console.error("Login error:", err);
    setError(err?.message || "Error al iniciar sesión");
  } finally {
    setLoading(false);
  }
};


  return (
  <div
    className="min-h-screen bg-cover bg-center bg-no-repeat flex flex-col items-center justify-center relative"
    style={{ backgroundImage: "url('/logo.png')" }}
  >
    {/* 🔥 Capa oscura */}
    <div className="absolute inset-0 bg-black/50" />

    {/* 🔥 Contenido */}
    <div className="relative z-10 w-full flex flex-col items-center px-4">

      {/* 🔥 TÍTULO */}
     <img
  src="/IDApp.png"
  alt="IDAPP"
  className="mb-8 w-56 h-auto object-contain"
/>

      {/* 🔥 LOGIN */}
      <Card className="w-full max-w-md shadow-2xl bg-white/90 backdrop-blur-md">
        <CardHeader>
          <CardTitle className="text-center text-xl font-semibold">
            Iniciar sesión
          </CardTitle>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Correo */}
            <div className="flex flex-col space-y-1">
              <span className="text-sm font-medium text-neutral-700">
                Correo
              </span>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {/* Contraseña */}
            <div className="flex flex-col space-y-1">
              <span className="text-sm font-medium text-neutral-700">
                Contraseña
              </span>

              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="pr-10"
                />

                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-neutral-600 hover:bg-neutral-100"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <p className="text-sm text-red-500 whitespace-pre-wrap">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Entrando..." : "Entrar"}
            </Button>

          </form>
        </CardContent>
      </Card>
    </div>
  </div>
);
}
