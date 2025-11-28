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

interface GenerateWalletsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function GenerateWalletsDialog({ open, onOpenChange, onConfirm }: GenerateWalletsDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Generate Wallets - Security Notice</AlertDialogTitle>
          <AlertDialogDescription className="space-y-4 text-left">
            <p>
              You can create wallets through offlinelana.org or right here. You need to be aware that these are generated on your computer, which is online, whereas on offlinelana.org this is done when your computer is offline.
            </p>
            <p>
              Everything depends on your internal security posture. If you feel you need to protect yourself, use offlinelana.org, otherwise do it here and simplify your life 🙂
            </p>
            <p className="font-semibold">
              The responsibility is in your hands.
            </p>
            <p className="text-sm text-muted-foreground">
              By clicking "Generate", 8 new wallets will be created and automatically filled in the form. A PDF document with all wallet information and QR codes will be generated for secure storage.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Generate Wallets</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
