import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTranslation } from "react-i18next";

interface GenerateWalletsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function GenerateWalletsDialog({ open, onOpenChange, onConfirm }: GenerateWalletsDialogProps) {
  const { t } = useTranslation();
  
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>{t('generateWalletsDialog.title')}</AlertDialogTitle>
          <AlertDialogDescription className="space-y-4 text-left">
            <p>{t('generateWalletsDialog.message1')}</p>
            <p>{t('generateWalletsDialog.message2')}</p>
            <p className="font-semibold">{t('generateWalletsDialog.message3')}</p>
            <p className="text-sm text-muted-foreground">{t('generateWalletsDialog.message4')}</p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{t('generateWalletsDialog.generate')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
