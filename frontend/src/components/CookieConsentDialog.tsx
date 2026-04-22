import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  onAccept: () => void;
  onDecline: () => void;
};

export function CookieConsentDialog({ open, onAccept, onDecline }: Props) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>We use cookies</AlertDialogTitle>
          <AlertDialogDescription>
            We use cookies to keep you logged in, remember preferences, and improve InsightPilot. You can accept or decline
            non-essential cookies. See our <a href="/privacy" className="underline">privacy policy</a> for details.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex gap-2">
          <AlertDialogCancel asChild>
            <Button variant="outline" onClick={onDecline}>
              Decline
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button onClick={onAccept}>Accept</Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
