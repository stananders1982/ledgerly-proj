import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { useCan } from "@/lib/permissions";

export function ConfirmDelete({
  onConfirm,
  label = "Delete item?",
  description = "This action cannot be undone.",
  /** Optional text button instead of the default icon button. */
  text,
  confirmText = "Delete",
  size,
  className,
  disabled,
}: {
  onConfirm: () => void;
  label?: string;
  description?: string;
  text?: string;
  confirmText?: string;
  size?: "sm" | "default" | "icon";
  className?: string;
  disabled?: boolean;
}) {
  const can = useCan();
  if (!can("delete_records")) return null;
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {text ? (
          <Button size={size ?? "sm"} variant="destructive" className={className} disabled={disabled}>
            <Trash2 className="h-4 w-4" /> {text}
          </Button>
        ) : (
          <Button size={size ?? "icon"} variant="ghost" className={className} disabled={disabled}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{label}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
