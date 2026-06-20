import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useStandaloneTheme } from "@/hooks/use-standalone-theme";

export function Toaster(props: ToasterProps) {
  const theme = useStandaloneTheme();

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      closeButton
      richColors
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
}
