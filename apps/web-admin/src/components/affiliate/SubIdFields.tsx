import { Input } from "../ui/Input";
import { Label } from "../ui/Label";

type SubIdFieldsProps = {
  title?: string;
  subIds: Record<string, string>;
  maxFields: number;
  onChange: (field: string, value: string) => void;
  disabled?: boolean;
  warning?: string;
};

function sanitizeSubId(value: string) {
  return value.replace(/[^a-zA-Z0-9_]/g, "");
}

export function SubIdFields({ title = "Sub ID", subIds, maxFields, onChange, disabled, warning }: SubIdFieldsProps) {
  const keys = Array.from({ length: maxFields }, (_, index) => `subId${index + 1}`);

  return (
    <div className="affiliate-subid-fields">
      <Label>{title}</Label>
      <div className="affiliate-subid-grid">
        {keys.map((key, index) => (
          <label key={key} className="affiliate-subid-input">
            <span>{`Sub_id${index + 1}`}</span>
            <Input
              value={subIds[key] ?? ""}
              onChange={(event) => onChange(key, sanitizeSubId(event.target.value))}
              disabled={disabled}
              placeholder={`Sub_id${index + 1}`}
            />
          </label>
        ))}
      </div>
      {warning ? <p className="field-hint warning">{warning}</p> : null}
    </div>
  );
}
