import { invokeEffect } from "@/lib/effect/tauri";
import { runEffect } from "@/lib/effect/run";
import { canUseTauriIpc } from "@/lib/tauri-runtime";

export type ContractReport = {
  ok: boolean;
  errors: string[];
};

export async function checkWorkspaceContract(root: string): Promise<ContractReport> {
  if (!canUseTauriIpc()) {
    return { ok: false, errors: ["Contract check requires the desktop app."] };
  }
  return runEffect(invokeEffect<ContractReport>("contract_check_workspace", { root }));
}
