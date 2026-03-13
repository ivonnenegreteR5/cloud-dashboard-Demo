"use client";

import React, { useEffect, useState } from "react";
import { useTenant } from "@/components/tenant-context";
import { usePathname } from "next/navigation";
import { AppHeader } from "@/components/app-header";
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
import { Eye, EyeOff } from "lucide-react";

type PersonnelItem = {
  id: string;
  Name?: string;
  Email?: string;
  role?: string;
  Location?: string;
};

type LocationItem = {
  id: string;
  Name: string;
};

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "api", label: "API" },
  { value: "all_locations", label: "Ver todas las ubicaciones" },
  { value: "admin_location", label: "Admin por ubicación" },
  { value: "view_location", label: "Ver ubicación seleccionada" },
];

export default function NuevoUsuarioPage() {
  // 🔹 Sacar tenantId de: contexto, URL o localStorage, evitando "undefined"/"null"
  const tenantFromContext = useTenant() as string | undefined;
  const pathname = usePathname();

  const tenantFromPath = (() => {
    if (!pathname) return undefined;
    const parts = pathname.split("/").filter(Boolean);
    if (!parts.length) return undefined;
    const t = parts[0];
    if (!t || t === "undefined" || t === "null") return undefined;
    return t;
  })();

  const tenantFromStorage =
    typeof window !== "undefined"
      ? (() => {
          const raw = window.localStorage.getItem("cloudTenantId");
          if (!raw || raw === "undefined" || raw === "null") return undefined;
          return raw;
        })()
      : undefined;

  const tenantId =
    (tenantFromContext &&
      tenantFromContext !== "undefined" &&
      tenantFromContext !== "null" &&
      tenantFromContext) ||
    tenantFromPath ||
    tenantFromStorage ||
    "";

  const [userId, setUserId] = useState("");
  const [name, setName] = useState("");

  // ✅ Email dividido:
  // - emailLocal: antes del @
  // - emailDomain: después de @tenant.
  const [emailLocal, setEmailLocal] = useState("");
  const [emailDomain, setEmailDomain] = useState("com"); // ✅ default "com" (puedes cambiarlo a "mx" si quieres)

  // ✅ Parte fija @tenant. (NO editable)
  const fixedAtTenantDot = tenantId ? `@${tenantId}.` : "@tenant.";

  // ✅ Email final
  const fullEmail = `${emailLocal.trim()}${fixedAtTenantDot}${emailDomain.trim()}`;

  const [password, setPassword] = useState("");

  const [role, setRole] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);

  // ✅ loading específico por fila al eliminar
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);

  const [users, setUsers] = useState<PersonnelItem[]>([]);

  // ✅ show/hide password
  const [showPassword, setShowPassword] = useState(false);

  // Helpers para tokens
  const getSessionToken = () => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem("cloudSessionToken");
  };

  const getIdToken = () => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem("cloudIdToken");
  };

  // ---- Cargar usuarios ya existentes ----
  const fetchUsers = async () => {
    try {
      if (!tenantId) {
        setError(
          "No se pudo determinar el tenantId. Revisa que la URL sea /[tenant]/usuarios/nuevo."
        );
        return;
      }

      const sessionToken = getSessionToken();
      const idToken = getIdToken();

      if (!sessionToken) {
        setError(
          "No se encontró sessionToken. Intenta volver a iniciar sesión en el dashboard."
        );
        return;
      }

      setListLoading(true);
      setError(null);

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-session-token": sessionToken,
        "x-tenant-id": String(tenantId),
      };

      if (idToken) {
        headers["Authorization"] = `Bearer ${idToken}`;
      }

      const res = await fetch("/api/cloud/personnel/list", {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      });

      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text };
      }

      if (!res.ok || (data.status !== undefined && data.status !== 0)) {
        const msg =
          data.error ||
          data.message ||
          data.raw ||
          `Error HTTP ${res.status} al obtener usuarios.`;
        throw new Error(msg);
      }

      const items: any[] = data.items || data.personnel || [];
      const mapped: PersonnelItem[] = items.map((it) => ({
        id: it._id || it.id || "",
        Name: it.Name,
        Email: it.Email,
        role: it.role,
        Location: it.Location,
      }));

      setUsers(mapped);
    } catch (err: any) {
      console.error("fetchUsers error:", err);
      setError(err.message || "Error cargando usuarios");
    } finally {
      setListLoading(false);
    }
  };

  // ---- Cargar ubicaciones para el selector ----
  const fetchLocations = async () => {
    try {
      if (!tenantId) return;

      const sessionToken = getSessionToken();
      const idToken = getIdToken();
      if (!sessionToken) return;

      setLocationsLoading(true);

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-session-token": sessionToken,
        "x-tenant-id": String(tenantId),
      };
      if (idToken) {
        headers["Authorization"] = `Bearer ${idToken}`;
      }

      const res = await fetch("/api/cloud/locations/list", {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      });

      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text };
      }

      if (!res.ok || (data.status !== undefined && data.status !== 0)) {
        const msg =
          data.error ||
          data.message ||
          data.raw ||
          `Error HTTP ${res.status} al obtener ubicaciones.`;
        throw new Error(msg);
      }

      const items: any[] = data.items || data.locations || [];
      const mapped: LocationItem[] = items.map((it) => ({
        id: it._id || it.id || "",
        Name: it.Name || it.name || "",
      }));

      setLocations(mapped);
    } catch (err: any) {
      console.error("fetchLocations error:", err);
      setError((prev) => prev || err.message || "Error cargando ubicaciones");
    } finally {
      setLocationsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchLocations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setOkMessage(null);

    try {
      if (!tenantId) {
        setError(
          "No se pudo determinar el tenantId. Revisa que la URL sea /[tenant]/usuarios/nuevo."
        );
        return;
      }

      const sessionToken = getSessionToken();
      const idToken = getIdToken();
      if (!sessionToken) {
        setError(
          "No se encontró sessionToken. Intenta volver a iniciar sesión en el dashboard."
        );
        return;
      }

      setLoading(true);

      // ✅ Email obligatorio: local + dominio + password
      if (!emailLocal.trim() || !emailDomain.trim() || !password) {
        throw new Error("Email y contraseña son obligatorios.");
      }

      // ✅ mínimo 8 caracteres
      if (password.length < 8) {
        throw new Error("La contraseña debe tener mínimo 8 caracteres.");
      }

      if (!role) {
        throw new Error("Selecciona un rol.");
      }

      const needsLocation =
        role === "admin_location" || role === "view_location";

      if (needsLocation && !selectedLocationId) {
        throw new Error("Selecciona una ubicación.");
      }

      // Buscar el nombre de la ubicación seleccionada
      let selectedLocationName = "";
      if (selectedLocationId) {
        const loc = locations.find((l) => l.id === selectedLocationId);
        selectedLocationName = loc?.Name || "";
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-session-token": sessionToken,
        "x-tenant-id": String(tenantId),
      };
      if (idToken) {
        headers["Authorization"] = `Bearer ${idToken}`;
      }

      const res = await fetch("/api/cloud/personnel/create", {
        method: "POST",
        headers,
        body: JSON.stringify({
          email: fullEmail, // ✅ empleado001.admi@tenant.com
          password,
          name,
          id: userId || undefined,
          role,
          location: selectedLocationName || undefined,
        }),
      });

      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text };
      }

      if (!res.ok || data.status !== 0) {
        const msg =
          data.error ||
          data.message ||
          data.raw ||
          `Error HTTP ${res.status} al crear usuario.`;
        throw new Error(msg);
      }

      setOkMessage("Usuario creado correctamente ✅");

      // Limpiar formulario
      setUserId("");
      setName("");
      setEmailLocal("");
      setEmailDomain("com"); // ✅ default otra vez
      setPassword("");
      setRole("");
      setSelectedLocationId("");

      // Refrescar lista
      fetchUsers();
    } catch (err: any) {
      console.error("handleSubmit error:", err);
      setError(err.message || "Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  // Delete con loading por fila + mensajes
  const handleDelete = async (id: string) => {
    const confirmDelete = window.confirm(
      "¿Seguro que deseas eliminar este usuario?"
    );
    if (!confirmDelete) return;

    try {
      setError(null);
      setOkMessage(null);

      if (!tenantId) {
        setError(
          "No se pudo determinar el tenantId. Revisa que la URL sea /[tenant]/usuarios/nuevo."
        );
        return;
      }

      const sessionToken = getSessionToken();
      const idToken = getIdToken();
      if (!sessionToken) {
        setError(
          "No se encontró sessionToken. Intenta volver a iniciar sesión en el dashboard."
        );
        return;
      }

      setDeletingId(id);

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-session-token": sessionToken,
        "x-tenant-id": String(tenantId),
      };
      if (idToken) {
        headers["Authorization"] = `Bearer ${idToken}`;
      }

      const res = await fetch("/api/cloud/personnel/delete", {
        method: "POST",
        headers,
        body: JSON.stringify({ id }),
      });

      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text };
      }

      if (
        !res.ok ||
        (data.status !== undefined && data.status !== 0 && data.ok !== true)
      ) {
        const msg =
          data.error ||
          data.message ||
          data.raw ||
          `Error HTTP ${res.status} al eliminar usuario.`;
        throw new Error(msg);
      }

      setUsers((prev) => prev.filter((u) => u.id !== id));
      setOkMessage("Usuario eliminado ✅");
    } catch (err: any) {
      console.error("handleDelete error:", err);
      setError(err.message || "Error eliminando usuario");
    } finally {
      setDeletingId(null);
    }
  };

  const needsLocation =
    role === "admin_location" || role === "view_location";

  return (
    <>
      <AppHeader />

      <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
        {/* Card de alta de usuario */}
        <Card>
          <CardHeader>
            <CardTitle>Alta de usuarios</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={handleSubmit}
              autoComplete="off"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">ID</label>
                  <Input
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    placeholder="Ej: empleado_01"
                    autoComplete="off"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Nombre</label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nombre completo"
                    autoComplete="off"
                  />
                </div>

                {/* ✅ Email: [local][@tenant.][domain] */}
                <div>
                  <label className="text-sm font-medium">Email</label>

                  <div className="flex rounded-md border border-input bg-background overflow-hidden">
                    {/* antes del @ */}
                    <Input
                      type="text"
                      value={emailLocal}
                      onChange={(e) => {
                        const v = e.target.value;
                        setEmailLocal(v.includes("@") ? v.split("@")[0] : v);
                      }}
                      required
                      placeholder="empleado001.admi"
                      autoComplete="off"
                      className="border-0 rounded-none focus-visible:ring-0"
                    />

                    {/* fijo @tenant. (negro) */}
                    <div className="px-3 flex items-center text-sm font-medium text-black border-l bg-neutral-50 whitespace-nowrap">
                      {fixedAtTenantDot}
                    </div>

                    {/* después del punto */}
                    <Input
                      type="text"
                      value={emailDomain}
                      onChange={(e) => {
                        let v = e.target.value.trim();
                        v = v.replace(/^\.+/, ""); // no permitir iniciar con "."
                        setEmailDomain(v);
                      }}
                      required
                      placeholder="com"
                      autoComplete="off"
                      className="border-0 rounded-none focus-visible:ring-0 w-28 md:w-36"
                    />
                  </div>

                  <p className="text-xs text-neutral-500 mt-1">
                    Se creará como:{" "}
                    <span className="font-medium">{fullEmail}</span>
                  </p>
                </div>

                {/* Password */}
                <div>
                  <label className="text-sm font-medium">Contraseña</label>

                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                      placeholder="Mínimo 8 caracteres"
                      autoComplete="new-password"
                      className="pr-10"
                    />

                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-neutral-600 hover:bg-neutral-100"
                      aria-label={
                        showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                      }
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">Rol</label>
                  <Select
                    value={role}
                    onValueChange={(value) => {
                      setRole(value);
                      setSelectedLocationId("");
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona un rol" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {needsLocation && (
                  <div>
                    <label className="text-sm font-medium">Ubicación</label>
                    {locationsLoading ? (
                      <p className="text-xs text-neutral-500">
                        Cargando ubicaciones...
                      </p>
                    ) : (
                      <Select
                        value={selectedLocationId}
                        onValueChange={setSelectedLocationId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona una ubicación" />
                        </SelectTrigger>
                        <SelectContent>
                          {locations.map((loc) => (
                            <SelectItem key={loc.id} value={loc.id}>
                              {loc.Name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
              {okMessage && (
                <p className="text-sm text-emerald-600">{okMessage}</p>
              )}

              <Button type="submit" disabled={loading}>
                {loading ? "Guardando..." : "Añadir usuario"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Card de listado de usuarios */}
        <Card>
          <CardHeader>
            <CardTitle>Usuarios registrados</CardTitle>
          </CardHeader>
          <CardContent>
            {listLoading ? (
              <p className="text-sm text-neutral-600">Cargando usuarios...</p>
            ) : users.length === 0 ? (
              <p className="text-sm text-neutral-600">
                No hay usuarios registrados.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b bg-neutral-50">
                      <th className="px-3 py-2 text-left font-semibold">ID</th>
                      <th className="px-3 py-2 text-left font-semibold">
                        Nombre
                      </th>
                      <th className="px-3 py-2 text-left font-semibold">
                        Email
                      </th>
                      <th className="px-3 py-2 text-left font-semibold">Rol</th>
                      <th className="px-3 py-2 text-left font-semibold">
                        Ubicación
                      </th>
                      <th className="px-3 py-2 text-left font-semibold">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-b last:border-0">
                        <td className="px-3 py-2 align-middle">{u.id || "-"}</td>
                        <td className="px-3 py-2 align-middle">
                          {u.Name || "-"}
                        </td>
                        <td className="px-3 py-2 align-middle">
                          {u.Email || "-"}
                        </td>
                        <td className="px-3 py-2 align-middle">
                          {u.role || "-"}
                        </td>
                        <td className="px-3 py-2 align-middle">
                          {u.Location || "-"}
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={deletingId === u.id}
                            onClick={() => handleDelete(u.id)}
                          >
                            {deletingId === u.id ? "Eliminando..." : "Eliminar"}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
