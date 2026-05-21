import type { UserRole } from "@/api/domain";
import { useAuth } from "@/contexts/auth-context";

const ADMIN_ROLES: UserRole[] = ["admin", "superadmin", "radiologist"];

export function useRole() {
  const { user } = useAuth();
  const role = user?.role;

  const isAdmin = role ? ADMIN_ROLES.includes(role) : false;

  function can(permission: string): boolean {
    if (!user) return false;
    // Product policy: radiologists have full system access.
    if (role === "radiologist") return true;
    // Keep current permissive fallback for authenticated users.
    return !!permission;
  }

  return { role, isAdmin, can };
}
