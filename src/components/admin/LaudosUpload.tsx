import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Upload, X, FileText, Loader2, Download } from 'lucide-react';

interface LaudosUploadProps {
  sacRequestId: string;
  existingLaudos: string[] | null;
  onLaudosChange: (laudos: string[]) => void;
}

export default function LaudosUpload({ sacRequestId, existingLaudos, onLaudosChange }: LaudosUploadProps) {
  const { isVendas } = useAuth();
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const laudos = existingLaudos || [];

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragging(true);
    } else if (e.type === 'dragleave') {
      setIsDragging(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    await uploadFiles(droppedFiles);
  };

  const uploadFiles = async (files: File[]) => {
    const validFiles = files.filter(
      (file) =>
        file.size <= 100 * 1024 * 1024 &&
        (file.type.startsWith('image/') || file.type === 'application/pdf')
    );

    if (validFiles.length === 0) {
      toast.error('Nenhum arquivo válido. Use imagens ou PDFs até 100MB.');
      return;
    }

    setIsUploading(true);
    const newPaths: string[] = [];

    try {
      for (const file of validFiles) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${sacRequestId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('laudos')
          .upload(fileName, file);

        if (uploadError) throw uploadError;
        newPaths.push(fileName);
      }

      const updatedLaudos = [...laudos, ...newPaths];

      const { error: updateError } = await supabase
        .from('sac_requests')
        .update({ laudos: updatedLaudos })
        .eq('id', sacRequestId);

      if (updateError) throw updateError;

      onLaudosChange(updatedLaudos);
      toast.success(`${validFiles.length} laudo(s) anexado(s) com sucesso`);
    } catch (error) {
      console.error('Error uploading laudos:', error);
      toast.error('Erro ao fazer upload dos laudos');
    } finally {
      setIsUploading(false);
    }
  };

  const removeLaudo = async (path: string) => {
    try {
      const { error: deleteError } = await supabase.storage
        .from('laudos')
        .remove([path]);

      if (deleteError) throw deleteError;

      const updatedLaudos = laudos.filter((l) => l !== path);

      const { error: updateError } = await supabase
        .from('sac_requests')
        .update({ laudos: updatedLaudos })
        .eq('id', sacRequestId);

      if (updateError) throw updateError;

      onLaudosChange(updatedLaudos);
      toast.success('Laudo removido com sucesso');
    } catch (error) {
      console.error('Error removing laudo:', error);
      toast.error('Erro ao remover laudo');
    }
  };

  const downloadLaudo = async (path: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('laudos')
        .download(path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = path.split('/').pop() || 'laudo';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading laudo:', error);
      toast.error('Erro ao baixar laudo');
    }
  };

  const getFileName = (path: string) => {
    const parts = path.split('/');
    return parts[parts.length - 1];
  };

  return (
    <div className="space-y-3">
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => !isUploading && inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all duration-200 ${
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50 hover:bg-muted/50'
        } ${isUploading ? 'pointer-events-none opacity-50' : ''}`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,.pdf"
          onChange={(e) => uploadFiles(Array.from(e.target.files || []))}
          className="hidden"
        />
        {isUploading ? (
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Enviando...</span>
          </div>
        ) : (
          <>
            <Upload className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Arraste ou clique para anexar laudos (PDF ou imagens)
            </p>
          </>
        )}
      </div>

      {laudos.length > 0 && (
        <div className="space-y-2">
          {laudos.map((path, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-2 bg-muted rounded-lg"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm truncate">{getFileName(path)}</span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => downloadLaudo(path)}
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 hover:bg-destructive/10"
                  onClick={() => removeLaudo(path)}
                  disabled={isVendas}
                >
                  <X className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
