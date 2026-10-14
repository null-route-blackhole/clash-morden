import "./overview-design.css";

import { ChevronDown } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

export const OverviewIcon = ({
  label,
  active,
  children,
  ...props
}: ComponentProps<"button"> & {
  label: string;
  active?: boolean;
  children: ReactNode;
}) => (
  <button
    type="button"
    className="ds-icon"
    title={label}
    aria-label={label}
    aria-pressed={active}
    {...props}>
    {children}
  </button>
);

export const OverviewSegment = ({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) => (
  <fieldset className="ds-segment" aria-label={label}>
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        aria-pressed={option.value === value}
        onClick={() => onChange(option.value)}>
        {option.label}
      </button>
    ))}
  </fieldset>
);

export const OverviewPick = ({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) => (
  <label className="ds-pick">
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
    <ChevronDown />
  </label>
);

export const OverviewToggle = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) => (
  <label className="ds-toggle-label">
    <button
      type="button"
      className="ds-toggle"
      role="switch"
      aria-checked={value}
      aria-label={label}
      onClick={() => onChange(!value)}>
      <span />
    </button>
    {label}
  </label>
);
