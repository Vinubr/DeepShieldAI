import { forwardRef } from "react";
import { Loader2 } from "lucide-react";

const variants = {
  primary:
    "bg-neon-gradient text-white shadow-tile hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-45 disabled:shadow-none disabled:translate-y-0",
  volt:
    "bg-volt-gradient text-white shadow-tile hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-45",
  secondary:
    "border border-line bg-void-700 text-slate-200 hover:border-line-strong hover:bg-void-600 hover:text-slate-50 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-40 disabled:translate-y-0 shadow-sm",
  ghost:
    "text-slate-400 hover:bg-hover/8 hover:text-slate-50 disabled:opacity-40",
  danger:
    "bg-threat text-white shadow-tile hover:brightness-110 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-45",
  outlineDanger:
    "border border-threat/40 bg-threat/10 text-threat hover:bg-threat/20 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-40",
};

const sizes = {
  xs: "h-8 px-2.5 text-xs gap-1.5",
  sm: "h-9 px-3.5 text-xs gap-1.5",
  md: "h-11 px-5 text-sm gap-2",
  lg: "h-12 px-6 text-sm gap-2",
};

const Button = forwardRef(function Button(
  {
    as: Component = "button",
    variant = "primary",
    size = "md",
    loading = false,
    icon: Icon,
    className = "",
    disabled,
    children,
    ...props
  },
  ref
) {
  return (
    <Component
      ref={ref}
      disabled={Component === "button" ? disabled || loading : undefined}
      className={`group/btn inline-flex select-none items-center justify-center rounded-2xl font-semibold tracking-tight transition-all duration-200 focus-visible:ring-2 focus-visible:ring-neon-500 focus-visible:ring-offset-2 focus-visible:ring-offset-void-900 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        Icon && (
          <Icon
            className="h-4 w-4 transition-transform duration-200 group-hover/btn:scale-110"
            strokeWidth={2.25}
          />
        )
      )}
      {children}
    </Component>
  );
});

export default Button;
