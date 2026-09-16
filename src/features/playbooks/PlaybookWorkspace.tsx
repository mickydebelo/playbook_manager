"use client";
import { Dialog } from "@/components/ds";
import { sx } from "@/lib/ui/sx";
import { useWorkspace } from "@/features/workspace/useWorkspace";
import type { PlaybookDetail, UserDto } from "@/shared/contracts";
import { Stepper } from "./Stepper";
import { Step1DefineBrief } from "./Step1DefineBrief";
import { Step2FindTrust } from "./Step2FindTrust";
import { Step3EditCreate } from "./Step3EditCreate";
import { Step4ReviewDeliver } from "./Step4ReviewDeliver";

/** The create flow (design lines 62–590) plus the share dialog (line 694). */
export function PlaybookWorkspace({
  initial,
  user,
  startStep,
  templateId = null,
}: {
  initial: PlaybookDetail | null;
  user: UserDto;
  startStep?: number;
  templateId?: string | null;
}) {
  const v = useWorkspace({ initial, user, startStep, templateId });
  return (
    <div style={sx("display:flex;flex-direction:column;flex:1;min-height:0")}>
      <Stepper v={v} />
      {v.step1 ? <Step1DefineBrief v={v} /> : null}
      {v.step2 ? <Step2FindTrust v={v} /> : null}
      {v.step3 ? <Step3EditCreate v={v} /> : null}
      {v.step4 ? <Step4ReviewDeliver v={v} /> : null}
      <Dialog open={v.shareOpen} title="Share for feedback" body={v.shareBody} primaryLabel="Send invitation" onClose={v.closeShare} onPrimary={v.sendShare} />
    </div>
  );
}
