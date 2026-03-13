// components/tenant-context.tsx
"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type TenantContextValue = {
  tenantId: string; // ej. "hach"
};

const TenantContext = createContext<TenantContextValue | null>(null);

function isValidTenant(value: string) {
  const v = (value || "").trim();
  if (!v) return false;
  if (v === "undefined" || v === "null") return false;
  // evita paths raros por si acaso
  if (v.includes("/") || v.includes(" ")) return false;
  return true;
}

export function TenantProvider({
  tenantId,
  children,
}: {
  tenantId: string;
  children: React.ReactNode;
}) {
  // ✅ estado interno para que el tenant no quede vacío en hydration/navegación
  const [resolvedTenantId, setResolvedTenantId] = useState<string>(
    (tenantId || "").trim()
  );

  useEffect(() => {
    const incoming = (tenantId || "").trim();

    // 1) Si nos llega tenant por props, lo usamos y lo persistimos
    if (isValidTenant(incoming)) {
      setResolvedTenantId(incoming);

      try {
        // ✅ respetamos tu key existente
        localStorage.setItem("cloudTenantId", incoming);
      } catch {
        // ignore
      }
      return;
    }

    // 2) ✅ Si NO llegó por props, intentamos resolver desde la URL
    // Esto evita quedarse pegado a un tenant viejo (ej. "demo") cuando navegas a /hach, /comnet, etc.
    try {
      const parts = window.location.pathname.split("/").filter(Boolean);
      const fromPath = (parts[0] || "").trim();

      if (isValidTenant(fromPath)) {
        setResolvedTenantId(fromPath);
        try {
          localStorage.setItem("cloudTenantId", fromPath);
        } catch {
          // ignore
        }
        return;
      }
    } catch {
      // ignore
    }

    // 3) Si no se pudo por URL, lo intentamos recuperar del storage (tu comportamiento actual)
    try {
      const stored = (localStorage.getItem("cloudTenantId") || "").trim();
      if (isValidTenant(stored)) setResolvedTenantId(stored);
    } catch {
      // ignore
    }
  }, [tenantId]);

  const value = useMemo(
    () => ({ tenantId: (resolvedTenantId || "").trim() }),
    [resolvedTenantId]
  );

  return (
    <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
  );
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error("useTenant debe usarse dentro de <TenantProvider>");
  }
  return (ctx.tenantId || "").trim();
}
