import { useEffect, useId, useState, type Ref } from 'react';

type Option<T extends string | number> = {
  value: T;
  label: string;
};

type SearchableSelectProps<T extends string | number> = {
  value: T | '';
  options: Option<T>[];
  onChange: (selectedValue: T | null, inputValue: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  name?: string;
  inputRef?: Ref<HTMLInputElement>;
  autoFocus?: boolean;
};

function SearchableSelect<T extends string | number>({
  value,
  options,
  onChange,
  placeholder,
  disabled,
  className,
  name,
  inputRef,
  autoFocus,
}: SearchableSelectProps<T>) {
  const listId = useId();
  const [text, setText] = useState('');

  useEffect(() => {
    if (value === '' || value === null) {
      setText((prev) => (prev === '' ? prev : ''));
      return;
    }
    const match = options.find((opt) => opt.value === value);
    const label = match?.label ?? '';
    setText((prev) => (prev === label ? prev : label));
  }, [value, options]);

  return (
    <>
      <input
        ref={inputRef}
        list={listId}
        value={text}
        autoFocus={autoFocus}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        name={name}
        autoComplete="off"
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          const match = options.find(
            (opt) => opt.label.toLowerCase() === next.toLowerCase(),
          );
          onChange(match ? match.value : null, next);
        }}
        onBlur={(event) => {
          const next = event.target.value;
          const match = options.find(
            (opt) => opt.label.toLowerCase() === next.toLowerCase(),
          );
          if (match) {
            setText(match.label);
            onChange(match.value, match.label);
          }
        }}
      />
      <datalist id={listId}>
        {options.map((opt) => (
          <option key={String(opt.value)} value={opt.label} />
        ))}
      </datalist>
    </>
  );
}

export type { Option, SearchableSelectProps };
export { SearchableSelect };
