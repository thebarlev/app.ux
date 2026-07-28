"use client";

import { useRouter } from "next/navigation";
import { GitBranchPlus } from "lucide-react";
import ChainNewDocumentDialog, { type ChainNewDocumentKind } from "@/components/documents/ChainNewDocumentDialog";
import { Button } from "@/components/ui/button";
import { buildChainTargetHref, type ChainSourceDocument } from "@/lib/documents/chain-navigation";

/**
 * The dashboard's "שרשור" action.
 *
 * Reuses ChainNewDocumentDialog — the same picker the documents list opens — so
 * the available target types per source stay defined in one place, and both
 * entry points land on the same forms with the same prefill parameters. The
 * dashboard previously offered a single hard-coded "issue a receipt" link, which
 * both duplicated the mapping and hid the other valid targets.
 *
 * Credit notes are not offered here: that flow needs the list page's cancel
 * dialog, which is not available from the dashboard.
 */
export default function DashboardChainAction(props: {
  source: ChainSourceDocument;
  sourceTypeLabel: string;
  label?: string;
  className?: string;
  /** "icon" matches the documents list; "text" keeps the original link style. */
  variant?: "text" | "icon";
}) {
  const router = useRouter();

  const onSelect = (kind: ChainNewDocumentKind) => {
    const href = buildChainTargetHref(kind, props.source, props.sourceTypeLabel);
    if (href) router.push(href);
  };

  return (
    <ChainNewDocumentDialog onSelect={onSelect} sourceDocumentType={props.source.document_type}>
      {props.variant === "icon" ? (
        <Button type="button" variant="ghost" size="icon" aria-label="שרשור מסמך חדש">
          <GitBranchPlus className="h-5 w-5" />
        </Button>
      ) : (
        <button type="button" className={props.className}>
          {props.label || "שרשור"}
        </button>
      )}
    </ChainNewDocumentDialog>
  );
}
