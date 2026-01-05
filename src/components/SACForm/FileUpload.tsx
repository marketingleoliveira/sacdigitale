import { Upload, X, FileText, Image } from "lucide-react";
import { useRef, useState } from "react";

interface FileUploadProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
  maxFiles?: number;
}

const FileUpload = ({ files, onFilesChange, maxFiles = 3 }: FileUploadProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragging(true);
    } else if (e.type === "dragleave") {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    addFiles(droppedFiles);
  };

  const addFiles = (newFiles: File[]) => {
    const validFiles = newFiles.filter(
      (file) =>
        file.size <= 5 * 1024 * 1024 && // 5MB limit
        (file.type.startsWith("image/") || file.type === "application/pdf")
    );
    const updatedFiles = [...files, ...validFiles].slice(0, maxFiles);
    onFilesChange(updatedFiles);
  };

  const removeFile = (index: number) => {
    const updatedFiles = files.filter((_, i) => i !== index);
    onFilesChange(updatedFiles);
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith("image/")) {
      return <Image className="w-5 h-5 text-info" />;
    }
    return <FileText className="w-5 h-5 text-warning" />;
  };

  return (
    <div className="space-y-4">
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 ${
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/50"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,.pdf"
          onChange={(e) => addFiles(Array.from(e.target.files || []))}
          className="hidden"
        />
        <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
        <p className="text-foreground font-medium">
          Clique para enviar ou arraste seus arquivos
        </p>
        <p className="text-sm text-muted-foreground mt-2">
          PNG, JPG ou PDF até 5MB (máximo {maxFiles} arquivos)
        </p>
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-3 bg-muted rounded-lg"
            >
              <div className="flex items-center gap-3">
                {getFileIcon(file)}
                <div>
                  <p className="text-sm font-medium text-foreground truncate max-w-[200px]">
                    {file.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeFile(index)}
                className="p-1.5 hover:bg-destructive/10 rounded-lg transition-colors"
              >
                <X className="w-4 h-4 text-destructive" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FileUpload;
