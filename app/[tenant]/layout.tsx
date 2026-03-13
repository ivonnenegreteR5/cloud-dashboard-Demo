// app/[tenant]/layout.tsx
import type { ReactNode } from "react";
import { TenantProvider } from "@/components/tenant-context";

export default function TenantLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { tenant: string };
}) {
  const { tenant } = params; // ej. /hach → tenant = "hach"

  return (
    <TenantProvider tenantId={tenant}>
      {children}
    </TenantProvider>
  );
}
