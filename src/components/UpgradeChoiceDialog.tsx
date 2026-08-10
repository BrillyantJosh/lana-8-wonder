import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { TrendingUp, ArrowRight } from "lucide-react";

interface UpgradeChoiceDialogProps {
  open: boolean;
  currentSplit: number;
  currency: string;
  currentDeposit: number;
  upgradeDeposit: number;
  onUpgrade: () => void;
  onCurrent: () => void;
  onCancel: () => void;
}

export function UpgradeChoiceDialog({
  open,
  currentSplit,
  currency,
  currentDeposit,
  upgradeDeposit,
  onUpgrade,
  onCurrent,
  onCancel,
}: UpgradeChoiceDialogProps) {
  const { t } = useTranslation();
  const prevSplit = currentSplit - 1;

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-amber-600" />
            {t('upgradeChoiceDialog.title')}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-left">
            {t('upgradeChoiceDialog.description', { prevSplit, currentSplit })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-3 pt-2">
          {/* Upgrade option */}
          <Button
            variant="outline"
            onClick={onUpgrade}
            className="h-auto py-3 px-4 flex items-center justify-between border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30"
          >
            <div className="flex flex-col items-start text-left">
              <span className="font-semibold">
                {t('upgradeChoiceDialog.upgradeButton', { split: prevSplit })}
              </span>
              <span className="text-xs text-muted-foreground">
                ~{upgradeDeposit.toFixed(2)} LANA {t('upgradeChoiceDialog.depositHint')}
              </span>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0" />
          </Button>

          {/* Current split option */}
          <Button
            variant="outline"
            onClick={onCurrent}
            className="h-auto py-3 px-4 flex items-center justify-between"
          >
            <div className="flex flex-col items-start text-left">
              <span className="font-semibold">
                {t('upgradeChoiceDialog.currentButton', { split: currentSplit })}
              </span>
              <span className="text-xs text-muted-foreground">
                ~{currentDeposit.toFixed(2)} LANA {t('upgradeChoiceDialog.depositHint')}
                {currency ? ` · 100 ${currency}` : ''}
              </span>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0" />
          </Button>

          {/* Cancel */}
          <Button variant="ghost" size="sm" onClick={onCancel} className="mt-1">
            {t('common.cancel')}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
