export type Role = string | null | undefined;

export function canManage(role: Role) {
  // ✅ los dos roles con permisos completos
  return role === "admin" || role === "admin_location";
}

export function isReadOnly(role: Role) {
  return !canManage(role);
}
