import type { ReactNode } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type NeonSelectOption = { value: string; label: ReactNode; disabled?: boolean };

// Radix Select can't use "" as an item value, so an empty option travels as this.
const EMPTY = "__empty__";

/**
 * The app-styled dropdown. Drop-in for a plain <select>: pass the value, the
 * options and a change handler that receives the chosen value.
 */
export function NeonSelect({
  value,
  onValueChange,
  options,
  placeholder,
  id,
  className,
  disabled,
  "aria-label": ariaLabel,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: NeonSelectOption[];
  placeholder?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  return (
    <Select
      value={value === "" ? EMPTY : value}
      onValueChange={(next) => onValueChange(next === EMPTY ? "" : next)}
      disabled={disabled}
    >
      <SelectTrigger id={id} className={className} aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem
            key={option.value === "" ? EMPTY : option.value}
            value={option.value === "" ? EMPTY : option.value}
            disabled={option.disabled}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
