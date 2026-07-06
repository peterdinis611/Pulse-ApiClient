import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useStandaloneTheme } from "@/hooks/use-standalone-theme";

export function Toaster({ ...props }: ToasterProps) {
  const theme = useStandaloneTheme();

  return (
    <Sonner
      theme={theme}
      closeButton
      position="bottom-right"
      visibleToasts={4}
      toastOptions={{ duration: 3500 }}
      {...props}
    />
  );
}
