import { useState, useEffect } from "react";
import { Send, Loader2, CheckCircle, Copy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import FormSection from "./FormSection";
import ContactTypeSelector from "./ContactTypeSelector";
import FileUpload from "./FileUpload";
interface FormData {
  name: string;
  email: string;
  phone: string;
  orderNumber: string;
  contactType: string;
  complaintType: string;
  subject: string;
  message: string;
  files: File[];
}
const SACForm = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  // SAC_UPLOAD_PROGRESS_V2
  const [uploadProgress, setUploadProgress] = useState<{
    name: string;
    percent: number;
    sent: number;
    total: number;
    speed: number;
    elapsed: number;
    remaining: number | null;
  } | null>(null);

  const [isSuccess, setIsSuccess] = useState(false);
  const [protocol, setProtocol] = useState<string | null>(null);
  const [complaintTypes, setComplaintTypes] = useState<{ id: string; name: string }[]>([]);
  const [formData, setFormData] = useState<FormData>({
    name: "",
    email: "",
    phone: "",
    orderNumber: "",
    contactType: "",
    complaintType: "",
    subject: "",
    message: "",
    files: []
  });
  useEffect(() => {
    (async () => {
      const { data, error } = await (supabase as any)
        .from("complaint_types")
        .select("id, name")
        .eq("active", true)
        .order("name", { ascending: true });
      if (!error && data) setComplaintTypes(data as { id: string; name: string }[]);
    })();
  }, []);
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const {
      name,
      value
    } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const uploadFiles = async (files: File[]): Promise<string[]> => {
    const urls: string[] = [];
    const total = files.reduce((n, f) => n + f.size, 0);
    const started = performance.now();
    let completed = 0;

    const formatProgress = (name: string, sent: number) => {
      const elapsed = Math.max((performance.now() - started) / 1000, 0.01);
      const speed = sent / elapsed;
      setUploadProgress({
        name,
        percent: total ? Math.min(100, Math.round(sent / total * 100)) : 100,
        sent,
        total,
        speed,
        elapsed,
        remaining: speed > 0 ? (total - sent) / speed : null
      });
    };

    for (const file of files) {
      const key = `sac-upload-v2:${file.name}:${file.size}:${file.lastModified}`;
      let session: { id: string; token: string; chunkSize: number } | null = null;

      try {
        const previous = sessionStorage.getItem(key);
        if (previous) session = JSON.parse(previous);
      } catch {
        sessionStorage.removeItem(key);
      }

      const initialize = async () => {
        const response = await fetch("/api/uploads/init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: file.name,
            size: file.size,
            type: file.type || "application/octet-stream"
          })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Erro ao iniciar upload");
        session = data;
        sessionStorage.setItem(key, JSON.stringify(session));
      };

      if (!session) await initialize();

      let status = await fetch(`/api/uploads/${session!.id}`, {
        headers: { "x-upload-token": session!.token }
      });

      if (!status.ok) {
        sessionStorage.removeItem(key);
        await initialize();
        status = await fetch(`/api/uploads/${session!.id}`, {
          headers: { "x-upload-token": session!.token }
        });
        if (!status.ok) throw new Error("Erro ao recuperar upload");
      }

      let offset = Number((await status.json()).offset);
      formatProgress(file.name, completed + offset);

      while (offset < file.size) {
        const end = Math.min(offset + session!.chunkSize, file.size);
        const part = file.slice(offset, end);
        let success = false;

        for (let attempt = 0; attempt < 3 && !success; attempt++) {
          try {
            const result = await new Promise<{ offset: number }>(
              (resolve, reject) => {
                const xhr = new XMLHttpRequest();

                xhr.open(
                  "PUT",
                  `/api/uploads/${session!.id}/chunk`
                );

                xhr.setRequestHeader(
                  "Content-Type",
                  "application/octet-stream"
                );
                xhr.setRequestHeader(
                  "x-upload-token",
                  session!.token
                );
                xhr.setRequestHeader(
                  "x-upload-offset",
                  String(offset)
                );

                xhr.timeout = 120000;

                xhr.upload.onprogress = (event) => {
                  if (event.lengthComputable) {
                    const transmitted = Math.min(
                      event.loaded,
                      part.size
                    );

                    formatProgress(
                      file.name,
                      completed + offset + transmitted
                    );
                  }
                };

                xhr.onload = () => {
                  if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                      resolve(JSON.parse(xhr.responseText));
                    } catch {
                      reject(new Error("Resposta inválida do servidor"));
                    }
                  } else {
                    reject(new Error(
                      `Falha no upload: HTTP ${xhr.status}`
                    ));
                  }
                };

                xhr.onerror = () =>
                  reject(new Error("Falha de conexão no upload"));

                xhr.ontimeout = () =>
                  reject(new Error("Tempo de envio esgotado"));

                xhr.onabort = () =>
                  reject(new Error("Upload interrompido"));

                xhr.send(part);
              }
            );

            offset = Number(result.offset);
            success = true;
            formatProgress(file.name, completed + offset);
          } catch (error) {
            if (attempt === 2) throw error;

            const check = await fetch(`/api/uploads/${session!.id}`, {
              headers: { "x-upload-token": session!.token }
            });
            if (!check.ok) throw new Error("Não foi possível retomar o upload");
            const actual = Number((await check.json()).offset);

            if (actual > offset) {
              offset = actual;
              success = true;
              formatProgress(file.name, completed + offset);
            }
          }
        }
      }

      const finish = await fetch(`/api/uploads/${session!.id}/complete`, {
        method: "POST",
        headers: { "x-upload-token": session!.token }
      });

      const result = await finish.json();
      if (!finish.ok) throw new Error(result.error || "Falha ao finalizar upload");

      urls.push(result.url);
      sessionStorage.removeItem(key);
      completed += file.size;
      formatProgress(file.name, completed);
    }

    return urls;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation - All fields required
    if (!formData.name || !formData.email || !formData.phone || !formData.orderNumber || !formData.contactType || !formData.subject || !formData.message) {
      toast.error("Por favor, preencha todos os campos obrigatórios.");
      return;
    }
    if (formData.contactType === "reclamacao" && !formData.complaintType) {
      toast.error("Selecione o tipo da reclamação.");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      toast.error("Por favor, insira um e-mail válido.");
      return;
    }
    setIsSubmitting(true);
    try {
      // Upload files first if any
      let attachmentUrls: string[] = [];
      if (formData.files.length > 0) {
        toast.info("Enviando arquivos...");
        attachmentUrls = await uploadFiles(formData.files);
      }
      const {
        data,
        error
      } = await supabase.functions.invoke("submit-sac", {
        body: {
          contactType: formData.contactType,
          complaintType: formData.contactType === "reclamacao" ? formData.complaintType : null,
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          orderNumber: formData.orderNumber,
          subject: formData.subject,
          message: formData.message,
          attachments: attachmentUrls
        }
      });
      if (error) {
        console.error("Error submitting SAC request:", error);
        toast.error("Erro ao enviar solicitação. Tente novamente.");
        return;
      }
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      setProtocol(data.protocol);
      setIsSuccess(true);
      toast.success("Solicitação enviada com sucesso!");

      // Reset form
      setFormData({
        name: "",
        email: "",
        phone: "",
        orderNumber: "",
        contactType: "",
        complaintType: "",
        subject: "",
        message: "",
        files: []
      });
    } catch (error: any) {
      console.error("Error:", error);
      toast.error(error.message || "Erro ao enviar solicitação. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };
  const copyProtocol = () => {
    if (protocol) {
      navigator.clipboard.writeText(protocol);
      toast.success("Protocolo copiado!");
    }
  };
  const handleNewRequest = () => {
    setIsSuccess(false);
    setProtocol(null);
  };
  if (isSuccess && protocol) {
    return <div className="card-elevated rounded-2xl p-8 md:p-12 text-center space-y-6 animate-fade-in">
        <div className="w-20 h-20 mx-auto bg-green-100 rounded-full flex items-center justify-center">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>
        
        <h2 className="text-2xl font-bold text-foreground">
          Solicitação Enviada com Sucesso!
        </h2>
        
        <p className="text-muted-foreground">
          Recebemos sua solicitação e enviaremos um e-mail de confirmação para você.
          Nossa equipe analisará e retornará o mais breve possível.
        </p>
        
        <div className="bg-primary/5 border-2 border-dashed border-primary rounded-xl p-6">
          <p className="text-sm text-muted-foreground mb-2">Seu número de protocolo:</p>
          <div className="flex items-center justify-center gap-3">
            <span className="text-2xl font-bold text-primary">{protocol}</span>
            <button onClick={copyProtocol} className="p-2 hover:bg-primary/10 rounded-lg transition-colors" title="Copiar protocolo">
              <Copy className="w-5 h-5 text-primary" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Guarde este número para acompanhar sua solicitação
          </p>
        </div>
        
        <button onClick={handleNewRequest} className="btn-primary">
          Fazer Nova Solicitação
        </button>
      </div>;
  }
  return <form onSubmit={handleSubmit} className="space-y-6">
      {/* Info Banner */}
      <div className="card-elevated rounded-2xl p-6 border-l-4 border-primary">
        <p className="text-foreground">
          <strong className="text-primary">Como funciona:</strong>{" "}
          Preencha o formulário abaixo com suas informações e descreva detalhadamente
          sua solicitação. Nossa equipe analisará e retornará o mais breve possível.
        </p>
      </div>

      {/* Section 1: Contact Info */}
      <FormSection number={1} title="Informações de Contato" subtitle="Seus dados para retorno">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Nome da Empresa <span className="text-destructive">*</span>
            </label>
            <input type="text" name="name" value={formData.name} onChange={handleInputChange} placeholder="Digite o nome da empresa" className="input-field" maxLength={100} />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              E-mail <span className="text-destructive">*</span>
            </label>
            <input type="email" name="email" value={formData.email} onChange={handleInputChange} placeholder="seu@email.com" className="input-field" maxLength={255} />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Whatsapp*<span className="text-destructive">*</span>
            </label>
            <input type="tel" name="phone" value={formData.phone} onChange={handleInputChange} placeholder="(11) 99999-9999" className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Nota Fiscal <span className="text-destructive">*</span>
            </label>
            <input type="text" name="orderNumber" value={formData.orderNumber} onChange={handleInputChange} placeholder="Ex: NF 12345 / 2025-A" className="input-field" maxLength={100} />
          </div>
        </div>
      </FormSection>

      {/* Section 2: Contact Type */}
      <FormSection number={2} title="Tipo de Solicitação" subtitle="Selecione o motivo do seu contato">
        <ContactTypeSelector selectedType={formData.contactType} onSelect={type => setFormData(prev => ({
        ...prev,
        contactType: type,
        complaintType: type === "reclamacao" ? prev.complaintType : ""
      }))} />
        {formData.contactType === "reclamacao" && (
          <div className="mt-6 animate-fade-in">
            <label className="block text-sm font-medium text-foreground mb-2">
              Tipo da Reclamação <span className="text-destructive">*</span>
            </label>
            {complaintTypes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum tipo de reclamação cadastrado. Entre em contato com o administrador.
              </p>
            ) : (
              <select
                name="complaintType"
                value={formData.complaintType}
                onChange={handleInputChange}
                className="input-field"
              >
                <option value="">Selecione o tipo de reclamação</option>
                {complaintTypes.map((t) => (
                  <option key={t.id} value={t.name}>{t.name}</option>
                ))}
              </select>
            )}
          </div>
        )}
      </FormSection>

      {/* Section 3: Message Details */}
      <FormSection number={3} title="Detalhes da Solicitação" subtitle="Descreva sua solicitação com o máximo de detalhes">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Assunto <span className="text-destructive">*</span>
            </label>
            <input type="text" name="subject" value={formData.subject} onChange={handleInputChange} placeholder="Resumo da sua solicitação" className="input-field" maxLength={200} />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Mensagem <span className="text-destructive">*</span>
            </label>
            <textarea name="message" value={formData.message} onChange={handleInputChange} placeholder="Descreva detalhadamente sua solicitação, incluindo informações relevantes como datas, produtos, números de protocolo, etc." rows={6} className="input-field resize-none" maxLength={2000} />
            <p className="text-xs text-muted-foreground mt-2 text-right">
              {formData.message.length}/2000 caracteres
            </p>
          </div>
        </div>
      </FormSection>


      {uploadProgress && (
        <div className="rounded-xl border border-primary/20 bg-muted/40 p-4 space-y-3" role="status" aria-live="polite">
          <div className="flex justify-between gap-3 text-sm">
            <span className="font-medium truncate">{uploadProgress.name}</span>
            <span className="font-semibold">{uploadProgress.percent}%</span>
          </div>
          <div className="h-3 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${uploadProgress.percent}%` }}
              role="progressbar"
              aria-valuenow={uploadProgress.percent}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <span>Enviado: {(uploadProgress.sent / 1048576).toFixed(1)} / {(uploadProgress.total / 1048576).toFixed(1)} MB</span>
            <span>Velocidade: {(uploadProgress.speed / 1048576).toFixed(2)} MB/s</span>
            <span>Decorrido: {Math.floor(uploadProgress.elapsed)} s</span>
            <span>Restante estimado: {uploadProgress.remaining === null ? "Calculando..." : `${Math.ceil(uploadProgress.remaining)} s`}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Mantenha esta página aberta enquanto os anexos são enviados.
          </p>
        </div>
      )}

      {/* Section 4: Attachments */}
      <FormSection number={4} title="Anexos (opcional)" subtitle="Envie imagens ou documentos que ajudem a esclarecer sua solicitação">
        <FileUpload files={formData.files} onFilesChange={files => setFormData(prev => ({
        ...prev,
        files
      }))} />
      </FormSection>

      {/* Privacy Notice & Submit */}
      <div className="card-elevated rounded-2xl p-6 md:p-8 space-y-6">
        <p className="text-sm text-muted-foreground">
          Ao enviar este formulário, você concorda com nossa{" "}
          <a href="#" className="text-primary hover:underline font-medium">
            Política de Privacidade
          </a>
          . Seus dados serão utilizados exclusivamente para atender sua solicitação
          e melhorar nossos serviços.
        </p>

        <button type="submit" disabled={isSubmitting} className="btn-primary w-full md:w-auto flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed">
          {isSubmitting ? <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Enviando...
            </> : <>
              <Send className="w-5 h-5" />
              Enviar Solicitação
            </>}
        </button>
      </div>
    </form>;
};
export default SACForm;