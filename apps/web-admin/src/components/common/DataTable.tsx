import type { ReactNode } from "react";

export function DataTable({
  columns,
  children,
  empty
}: {
  columns: ReactNode;
  children: ReactNode;
  empty?: ReactNode;
}) {
  return (
    <table className="table">
      <thead>
        <tr>{columns}</tr>
      </thead>
      <tbody>{children || empty}</tbody>
    </table>
  );
}
