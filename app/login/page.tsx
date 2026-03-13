// app/login/page.tsx
"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff } from "lucide-react";

const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY!;

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showPassword, setShowPassword] = useState(false);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setLoading(true);
      setError(null);

      // 1️⃣ Obtener idToken de Firebase (Identity Toolkit)
      const firebaseResp = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            returnSecureToken: true,
          }),
        }
      );

      const firebaseData = await firebaseResp.json();

      if (!firebaseResp.ok) {
        throw new Error(
          firebaseData.error?.message ||
            "Error obteniendo idToken de Firebase"
        );
      }

      const firebaseIdToken = firebaseData.idToken as string;
      if (!firebaseIdToken) {
        throw new Error("Firebase no devolvió idToken");
      }

      // Guardamos idToken (para llamadas protegidas de tu API)
      localStorage.setItem("cloudIdToken", firebaseIdToken);

      // 2️⃣ Crear SessionToken de tu Cloud API usando email/password
      const resp = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await resp.json();

      if (!resp.ok || !data.ok) {
        throw new Error(data.error || "Error creando SessionToken");
      }

      // ✅ SessionToken de tu Cloud API
      const sessionToken = data.sessionToken as string;
      if (!sessionToken) {
        throw new Error("La API no devolvió sessionToken");
      }

      // ✅ Tenant y Role desde tu API
      const tenantId = data.user?.tenantId || "demo";
      const role = (data.user?.role || "user") as string;

      // ✅ Si tu /api/auth/session devuelve idToken, lo usamos como refuerzo;
      // si no, nos quedamos con el de Firebase que ya guardamos.
      const apiIdToken = (data.idToken as string | undefined) || firebaseIdToken;

      // Guardar en localStorage
      localStorage.setItem("cloudIdToken", apiIdToken);
      localStorage.setItem("cloudSessionToken", sessionToken);
      localStorage.setItem("cloudUserEmail", email);
      localStorage.setItem("cloudTenantId", tenantId);

      // ✅ NUEVO: guardar rol para controlar menú
      localStorage.setItem("cloudUserRole", role);

      // 3️⃣ Redirigir al dashboard del tenant
      router.push(`/${tenantId}`);
    } catch (err: any) {
      console.error("Login error:", err);
      setError(err?.message || "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <Card className="w-full max-w-md shadow-md">
        <CardHeader>
          <CardTitle className="text-center text-xl">
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
  );
}
