import type { AttachmentChip, SessionUsageSummary } from "@projectx/ui";
import { Composer, CostSummary } from "@projectx/ui";
import type { ReactElement } from "react";

export interface SessionComposerSectionProps {
  readonly text: string;
  readonly think: boolean;
  readonly search: boolean;
  readonly streaming: boolean;
  readonly attachments: readonly AttachmentChip[];
  readonly usage: SessionUsageSummary;
  readonly onChangeText: (value: string) => void;
  readonly onToggleThink: () => void;
  readonly onToggleSearch: () => void;
  readonly onAttach: () => void;
  readonly onRemoveAttachment: (id: string) => void;
  readonly onSend: () => void;
  readonly onStop: () => void;
  readonly onRecord: () => void;
}

/** Bottom zone: session totals, then the pinned composer. */
export function SessionComposerSection({
  text,
  think,
  search,
  streaming,
  attachments,
  usage,
  onChangeText,
  onToggleThink,
  onToggleSearch,
  onAttach,
  onRemoveAttachment,
  onSend,
  onStop,
  onRecord,
}: SessionComposerSectionProps): ReactElement {
  return (
    <>
      <CostSummary usage={usage} />
      <Composer
        value={text}
        placeholder="Reply or hold to talk"
        think={think}
        search={search}
        streaming={streaming}
        attachments={attachments}
        onChangeText={onChangeText}
        onToggleThink={onToggleThink}
        onToggleSearch={onToggleSearch}
        onAttach={onAttach}
        onRemoveAttachment={onRemoveAttachment}
        onSend={onSend}
        onStop={onStop}
        onRecord={onRecord}
      />
    </>
  );
}
