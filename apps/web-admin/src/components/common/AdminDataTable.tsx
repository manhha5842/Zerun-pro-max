import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/Table";

export type AdminDataTableColumn<T> = {
  key: string;
  header: ReactNode;
  width?: number | string;
  render: (row: T) => ReactNode;
};

export function AdminDataTable<T>({
  rows,
  columns,
  getRowKey,
  empty,
  compact = true
}: {
  rows: T[];
  columns: Array<AdminDataTableColumn<T>>;
  getRowKey: (row: T) => string;
  empty?: ReactNode;
  compact?: boolean;
}) {
  if (rows.length === 0) {
    return <>{empty ?? <div className="text-muted" style={{ padding: 16 }}>Chưa có dữ liệu.</div>}</>;
  }

  return (
    <div className="table-wrap">
      <Table className={`${compact ? "table-compact" : ""}`}>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column.key} style={column.width ? { width: column.width } : undefined}>
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={getRowKey(row)}>
              {columns.map((column) => (
                <TableCell key={column.key}>{column.render(row)}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
