import { toast as sonner } from "sonner";

export const toast = {
  success(title: string, description?: string) {
    sonner.success(title, { description });
  },
  error(title: string, description?: string) {
    sonner.error(title, { description });
  },
  info(title: string, description?: string) {
    sonner.info(title, { description });
  },
  warning(title: string, description?: string) {
    sonner.warning(title, { description });
  },
};
