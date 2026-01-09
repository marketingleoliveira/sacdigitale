import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Clock, LogOut } from 'lucide-react';

interface InactivityWarningProps {
  open: boolean;
  remainingSeconds: number;
  onDismiss: () => void;
  onLogout: () => void;
}

export default function InactivityWarning({
  open,
  remainingSeconds,
  onDismiss,
  onLogout,
}: InactivityWarningProps) {
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  const formatTime = () => {
    if (minutes > 0) {
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${seconds}s`;
  };

  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="mx-auto w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mb-4">
            <Clock className="h-6 w-6 text-amber-600" />
          </div>
          <AlertDialogTitle className="text-center">
            Sessão prestes a expirar
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center">
            Você será desconectado em <strong className="text-foreground">{formatTime()}</strong> por inatividade.
            <br />
            Clique em "Continuar" para permanecer conectado.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="sm:justify-center gap-2">
          <AlertDialogCancel onClick={onLogout} className="gap-2">
            <LogOut className="h-4 w-4" />
            Sair agora
          </AlertDialogCancel>
          <AlertDialogAction onClick={onDismiss}>
            Continuar conectado
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
