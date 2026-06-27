import { useDebouncedValue as usePacerDebouncedValue } from "@tanstack/react-pacer";

type UseDebouncedValueOptions = {
  delayMs?: number;
};

export function useDebouncedValue<T>(value: T, options?: UseDebouncedValueOptions): T {
  const [debounced] = usePacerDebouncedValue(value, {
    wait: options?.delayMs ?? 120,
    trailing: true,
    leading: false,
  });

  return debounced;
}

export { usePacerDebouncedValue as useDebouncedValueWithDebouncer };
