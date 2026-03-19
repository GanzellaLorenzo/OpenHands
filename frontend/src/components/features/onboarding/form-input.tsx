interface FormInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "email";
  rows?: number;
}

export function FormInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  rows,
}: FormInputProps) {
  const inputId = `form-input-${id}`;
  const inputClassName =
    "w-full h-10 rounded border border-t-[#242424] border-[#242424] bg-[#1F1F1F66] px-3 py-2 text-sm text-white placeholder:text-[#8C8C8C] focus:border-white focus:outline-none transition-colors";

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <label
        htmlFor={inputId}
        className="text-sm font-medium leading-5 text-neutral-400 cursor-pointer"
      >
        {label}
      </label>
      {rows ? (
        <textarea
          id={inputId}
          data-testid={inputId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className={`${inputClassName} h-auto resize-none`}
        />
      ) : (
        <input
          id={inputId}
          data-testid={inputId}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={inputClassName}
        />
      )}
    </div>
  );
}
