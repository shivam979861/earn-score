export type Role = "worker" | "lender" | "admin";
export type User = {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
};
export type Overview = Record<string, string | number | boolean | null>;
