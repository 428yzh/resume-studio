import { SECTION_FORM_CONFIGS, genId } from "@core/models/section";
import type { FormField } from "@core/models/section";

interface SectionFormProps {
  sectionKey: string;
  data: unknown;
  onChange: (data: unknown) => void;
}

export default function SectionForm({ sectionKey, data, onChange }: SectionFormProps) {
  const config = SECTION_FORM_CONFIGS[sectionKey];
  if (!config) return null;

  if (config.mode === "single") {
    return (
      <SingleForm
        fields={config.fields}
        data={(data as Record<string, unknown>) || {}}
        onChange={onChange}
      />
    );
  }

  return (
    <ArrayForm
      fields={config.fields}
      data={(data as Record<string, unknown>[]) || []}
      onChange={onChange}
    />
  );
}

// ─── Single mode ───────────────────────────────────────────

function SingleForm({
  fields,
  data,
  onChange,
}: {
  fields: FormField[];
  data: Record<string, unknown>;
  onChange: (data: unknown) => void;
}) {
  const handleChange = (key: string, value: unknown) => {
    onChange({ ...data, [key]: value });
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      {fields.map((field) => (
        <div key={field.key} className={field.colSpan === 2 ? "col-span-2" : ""}>
          <label className="block text-xs text-muted mb-1">{field.label}</label>
          <FieldInput field={field} value={data[field.key]} onChange={(v) => handleChange(field.key, v)} />
        </div>
      ))}
    </div>
  );
}

// ─── Array mode ────────────────────────────────────────────

function ArrayForm({
  fields,
  data,
  onChange,
}: {
  fields: FormField[];
  data: Record<string, unknown>[];
  onChange: (data: unknown) => void;
}) {
  const handleItemChange = (index: number, key: string, value: unknown) => {
    const next = data.map((item, i) => (i === index ? { ...item, [key]: value } : item));
    onChange(next);
  };

  const handleRemove = (index: number) => {
    onChange(data.filter((_, i) => i !== index));
  };

  const handleAdd = () => {
    const item: Record<string, unknown> = { id: genId() };
    for (const f of fields) {
      item[f.key] = f.type === "checkbox" ? false : "";
    }
    onChange([...data, item]);
  };

  return (
    <div className="space-y-3">
      {data.map((item, index) => {
        const titleField = item[fields[0]?.key];
        const titleVal = typeof titleField === "string" ? titleField : "";
        return (
          <div key={(item.id as string) || index} className="border border-hairline rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-ink truncate">
                {titleVal || `${fields[0]?.label || "条目"} ${index + 1}`}
              </span>
              <button
                type="button"
                onClick={() => handleRemove(index)}
                className="text-xs text-red/60 hover:text-red transition-colors shrink-0"
              >
                删除
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {fields.map((field) => (
                <div key={field.key} className={field.colSpan === 2 ? "col-span-2" : ""}>
                  <label className="block text-xs text-muted mb-1">{field.label}</label>
                  <FieldInput
                    field={field}
                    value={item[field.key]}
                    onChange={(v) => handleItemChange(index, field.key, v)}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <button
        type="button"
        onClick={handleAdd}
        className="w-full border border-dashed border-hairline rounded-xl py-3 text-sm text-slate hover:text-ink hover:border-blue/40 transition-colors"
      >
        + 添加{fields[0]?.label || "条目"}
      </button>
    </div>
  );
}

// ─── Field input renderer ──────────────────────────────────

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  switch (field.type) {
    case "textarea":
      return (
        <textarea
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className="w-full border border-hairline rounded-lg px-3 py-2 text-sm resize-y min-h-[80px] outline-none focus:border-blue transition-colors bg-canvas"
        />
      );

    case "date":
      return (
        <input
          type="date"
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-full border border-hairline rounded-lg px-3 py-2 text-sm outline-none focus:border-blue transition-colors bg-canvas"
        />
      );

    case "select": {
      const options = field.options || [];
      return (
        <select
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-full border border-hairline rounded-lg px-3 py-2 text-sm outline-none focus:border-blue transition-colors bg-canvas"
        >
          <option value="">请选择</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    }

    case "checkbox":
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            className="w-4 h-4 rounded border-hairline text-blue focus:ring-blue"
          />
          <span className="text-sm text-slate">{field.placeholder || field.label}</span>
        </label>
      );

    default:
      return (
        <input
          type="text"
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className="w-full border border-hairline rounded-lg px-3 py-2 text-sm outline-none focus:border-blue transition-colors bg-canvas"
        />
      );
  }
}
