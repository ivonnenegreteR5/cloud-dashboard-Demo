"use client";

import { useEffect, useState } from "react";

export interface AssetCustomField {
  key: string;
  label: string;
  type?: string;
  readOnly?: boolean;
}

export function useAssetCustomFields(tenantId: string | null | undefined) {
  const [fields, setFields] = useState<AssetCustomField[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;

    const sessionToken =
      typeof window !== "undefined"
        ? window.localStorage.getItem("cloudSessionToken")
        : null;

    const idToken =
      typeof window !== "undefined"
        ? window.localStorage.getItem("cloudIdToken")
        : null;

    if (!sessionToken || !idToken) {
      setError("Falta sessionToken o idToken");
      return;
    }

    setLoading(true);
    setError(null);

    (async () => {
      try {
        const res = await fetch(
          `/api/cloud/custom-fields/list?tenantId=${encodeURIComponent(
            tenantId
          )}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${idToken}`,
              "x-session-token": sessionToken,
            },
          }
        );

        const data = await res.json().catch(() => ({} as any));

        if (!res.ok || data.ok === false) {
          console.error("Error listando campos personalizados:", data);
          setError(
            data.error ||
              data.message ||
              `Error HTTP ${res.status} listando campos personalizados`
          );
          return;
        }

        const items = Array.isArray(data.items) ? data.items : [];
        setFields(
          items.map((f: any) => ({
            key: f.key,
            label: f.label,
            type: f.type,
            readOnly: !!f.readOnly,
          }))
        );
      } catch (err) {
        console.error("Error de red al listar campos personalizados:", err);
        setError("Error de red al listar campos personalizados");
      } finally {
        setLoading(false);
      }
    })();
  }, [tenantId]);

  return { fields, loading, error };
}
