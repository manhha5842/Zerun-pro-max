import type { CSSProperties, ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/Card";

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
    <Card className={cn(className)} style={style}>
      {title || description || actions ? (
        <CardHeader className="section-card-head">
          <div>
            {title ? <CardTitle className="section-card-title">{title}</CardTitle> : null}
            {description ? <CardDescription className="section-card-description">{description}</CardDescription> : null}
          </div>
          {actions ? <div className="actions">{actions}</div> : null}
        </CardHeader>
      ) : null}
      <CardContent className={cn(!padded && "p-0", !(title || description || actions) && padded && "pt-5")}>{children}</CardContent>
    </Card>
  );
}
