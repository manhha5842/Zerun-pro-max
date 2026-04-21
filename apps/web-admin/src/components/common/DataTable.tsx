import type { ReactNode } from "react";

export function DataTable({
  columns,
  children,
  empty,
  className
}: {
  columns: ReactNode;
  children: ReactNode;
  empty?: ReactNode;
  className?: string;
}) {
  return (
    <table className={className ? `table ${className}` : "table"}>
      <thead>
        <tr>{columns}</tr>
      </thead>
      <tbody>{children || empty}</tbody>
    </table>
  );
}
