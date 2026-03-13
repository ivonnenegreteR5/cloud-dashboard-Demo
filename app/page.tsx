// app/page.tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-50">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold">Cloud API Dashboard</h1>

        <p className="text-sm text-neutral-600">
          Inicia sesión para acceder al dashboard del tenant correspondiente.
        </p>

        <Button asChild>
          <Link href="/login">Iniciar sesión</Link>
        </Button>
      </div>
    </main>
  );
}
