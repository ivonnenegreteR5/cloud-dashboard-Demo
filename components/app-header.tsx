// components/app-header.tsx

"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTenant } from "@/components/tenant-context";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AppHeader() {
  const tenantId = useTenant() as string;
  const router = useRouter();
  const pathname = usePathname();

  const base = `/${tenantId}`;

  const go = (path: string) => router.push(path);

  const isActive = (path: string) => {
    if (path === base) return pathname === base;
    return pathname.startsWith(path);
  };

  // ✅ Rol (viene de tu API y lo guardas en login como "cloudUserRole")
  const role =
    (typeof window !== "undefined"
      ? localStorage.getItem("cloudUserRole")
      : null) || "user";

  // ✅ Admin "full" = admin o admin_location
  const roleLower = role.toLowerCase();
  const isAdmin = roleLower === "admin" || roleLower === "admin_location";

  // 👉 Cerrar sesión y regresar al login
  const handleLogout = () => {
    localStorage.clear();
    sessionStorage.clear();
    router.push("/login");
  };

  return (
    <header className="border-b bg-white">
      {/* Barra superior */}
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <span className="text-xl font-semibold tracking-tight">Cloud API</span>

        <div className="flex items-center gap-3">
          <span className="text-sm text-neutral-600">Cliente:</span>
          <span className="rounded-md border bg-neutral-50 px-3 py-1 text-sm">
            {tenantId}
          </span>
        </div>
      </div>

      {/* Barra de menús */}
      <div className="border-t">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          {/* Menú 1 (SIEMPRE visible) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="justify-between gap-2 bg-white px-5 py-2 text-sm shadow-sm"
              >
                <span className="font-semibold">Menú</span>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent className="w-64">
              <DropdownMenuLabel>Opciones</DropdownMenuLabel>
              <DropdownMenuSeparator />

              <DropdownMenuItem
                className={isActive(base) ? "bg-neutral-100 font-semibold" : ""}
                onClick={() => go(base)}
              >
                Pantalla principal
              </DropdownMenuItem>

              <DropdownMenuItem
                className={
                  isActive(`${base}/ubicaciones`)
                    ? "bg-neutral-100 font-semibold"
                    : ""
                }
                onClick={() => go(`${base}/ubicaciones`)}
              >
                Ubicaciones
              </DropdownMenuItem>

              <DropdownMenuItem
                className={
                  isActive(`${base}/transactions`)
                    ? "bg-neutral-100 font-semibold"
                    : ""
                }
                onClick={() => go(`${base}/transactions`)}
              >
                Transacciones
              </DropdownMenuItem>

              <DropdownMenuItem
                className={
                  isActive(`${base}/activos`)
                    ? "bg-neutral-100 font-semibold"
                    : ""
                }
                onClick={() => go(`${base}/activos`)}
              >
                Administrar activos
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Menú 2 (si NO admin, solo muestra "Cerrar sesión") */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="justify-between gap-2 bg-white px-5 py-2 text-sm shadow-sm"
              >
                <span className="font-semibold">Menú principal</span>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent className="w-80">
              <DropdownMenuLabel>Opciones de usuario</DropdownMenuLabel>
              <DropdownMenuSeparator />

              {/* ✅ Siempre visible */}
              <DropdownMenuItem
                onClick={handleLogout}
                className="text-red-600 focus:text-red-600"
              >
                Cerrar sesión
              </DropdownMenuItem>

              {/* 🔒 Admin y admin_location ven el resto */}
              {isAdmin && (
                <>
                  <DropdownMenuSeparator />

                  <DropdownMenuItem
                    className={
                      isActive(`${base}/usuarios/nuevo`)
                        ? "bg-neutral-100 font-semibold"
                        : ""
                    }
                    onClick={() => go(`${base}/usuarios/nuevo`)}
                  >
                    Alta de Usuarios
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    className={
                      isActive(`${base}/config/campos-personalizados`)
                        ? "bg-neutral-100 font-semibold"
                        : ""
                    }
                    onClick={() => go(`${base}/config/campos-personalizados`)}
                  >
                    Alta Campos personalizados
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
