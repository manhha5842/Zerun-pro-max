import type { ReactNode } from "react";

export function FilterToolbar({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="filter-toolbar">
      <div className="filter-toolbar-main">{children}</div>
      {actions ? <div className="actions">{actions}</div> : null}
    </div>
  );
}
