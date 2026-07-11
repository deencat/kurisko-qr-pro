import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";

type Props = {
  loading: boolean;
  icon: LucideIcon;
  loadingLabel: string;
  label: string;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
};

/** Stable DOM — avoids insertBefore crashes when extensions mutate the page. */
export function ActionButton({
  loading,
  icon: Icon,
  loadingLabel,
  label,
  className = "btn btn-primary gap-2",
  onClick,
  disabled,
  type = "button",
}: Props) {
  return (
    <button type={type} className={className} onClick={onClick} disabled={disabled || loading} aria-busy={loading}>
      <span className="inline-flex items-center gap-2">
        <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden>
          <Loader2 className={`absolute h-4 w-4 animate-spin ${loading ? "opacity-100" : "opacity-0"}`} />
          <Icon className={`h-4 w-4 ${loading ? "opacity-0" : "opacity-100"}`} />
        </span>
        <span>{loading ? loadingLabel : label}</span>
      </span>
    </button>
  );
}
