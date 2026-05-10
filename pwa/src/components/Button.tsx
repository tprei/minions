import type { ButtonHTMLAttributes, ReactElement, ReactNode } from "react";
import { cx } from "../util/cx";

export type ButtonVariant = "default" | "primary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md";
  loading?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}

const variantClass: Record<ButtonVariant, string> = {
  default: "btn",
  primary: "btn-primary",
  ghost: "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-fg-muted hover:text-fg hover:bg-bg-elev transition-colors",
  danger: "btn border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/40",
};

export function Button({
  variant = "default",
  size,
  loading,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps): ReactElement {
  return (
    <button
      {...rest}
      disabled={disabled ?? loading}
      className={cx(
        variantClass[variant],
        size === "sm" && "text-xs px-2 py-1",
        (disabled || loading) && "opacity-60 cursor-not-allowed",
        className,
      )}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </button>
  );
}
