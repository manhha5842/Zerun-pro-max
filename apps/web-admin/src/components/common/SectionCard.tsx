import type { CSSProperties, ReactNode } from "react";
import { cn } from "../../lib/utils";

export function SectionCard({
  title,
  description,
  children,
  actions,
  className,
  padded = true,
  style
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  padded?: boolean;
  style?: CSSProperties;
}) {
  return (
    <section className={cn("panel", padded && "panel-pad", className)} style={style}>
      {title || description || actions ? (
        <div className="section-card-head">
          <div>
            {title ? <h2 className="section-card-title">{title}</h2> : null}
            {description ? <p className="section-card-description">{description}</p> : null}
          </div>
          {actions ? <div className="actions">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
