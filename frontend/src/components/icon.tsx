import {
  Activity, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, AlertTriangle, BadgeCheck, Banknote, BookOpen, BrainCircuit,
  ChartNoAxesCombined, Check, ChevronRight, CircleAlert, ClipboardCheck, CloudUpload,
  Database, FileChartColumn, FileText, FlaskConical, Gauge, Info, Landmark, LayoutDashboard, ListFilter,
  LockKeyhole, LogOut, Menu, ScrollText, Settings2, Shield, ShieldAlert, ShieldCheck, SlidersHorizontal,
  Sparkles, UserRound, Users, UsersRound, Wallet, X, CheckCircle2, Eye, EyeOff, Search,
} from "lucide-react";
import type { LucideProps } from "lucide-react";
const all = {
  activity: Activity, "arrow-left": ArrowLeft, "alert-triangle": AlertTriangle, "arrow-down-right": ArrowDownRight, "arrow-right": ArrowRight,
  "arrow-up-right": ArrowUpRight, "badge-check": BadgeCheck, banknote: Banknote,
  "book-open": BookOpen, "brain-circuit": BrainCircuit, "chart-no-axes-combined": ChartNoAxesCombined,
  check: Check, "chevron-right": ChevronRight, "circle-alert": CircleAlert,
  "clipboard-check": ClipboardCheck, "cloud-upload": CloudUpload, database: Database,
  "file-chart-column": FileChartColumn, "file-text": FileText, "flask-conical": FlaskConical, gauge: Gauge, info: Info,
  landmark: Landmark, "layout-dashboard": LayoutDashboard, "list-filter": ListFilter,
  "lock-keyhole": LockKeyhole, "log-out": LogOut, menu: Menu, "shield-alert": ShieldAlert, "sliders-horizontal": SlidersHorizontal,
  "scroll-text": ScrollText, "settings": Settings2, shield: Shield,
  "shield-check": ShieldCheck, "check-circle-2": CheckCircle2, eye: Eye, "eye-off": EyeOff, search: Search, sparkles: Sparkles, user: UserRound,
  users: Users, "users-round": UsersRound, wallet: Wallet, x: X,
};
export function Icon({ name, ...props }: LucideProps & { name: string }) {
  const Component = all[name as keyof typeof all] ?? Sparkles;
  return <Component {...props} />;
}
