import { useState } from "react";
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
  subject: string;
  message: string;
  files: File[];
}

const SACForm = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [protocol, setProtocol] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({
    name: "",
    email: "",
    phone: "",
    orderNumber: "",
    contactType: "",
    subject: "",
    message: "",
    files: [],
  });

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.name || !formData.email || !formData.contactType || !formData.message) {
      toast.error("Por favor, preencha todos os campos obrigatórios.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      toast.error("Por favor, insira um e-mail válido.");
      return;
    }

    setIsSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke("submit-sac", {
        body: {
          contactType: formData.contactType,
          name: formData.name,
          email: formData.email,
          phone: formData.phone || undefined,
          orderNumber: formData.orderNumber || undefined,
          subject: formData.subject || undefined,
          message: formData.message,
        },
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
        subject: "",
        message: "",
        files: [],
      });
    } catch (error) {
      console.error("Error:", error);
      toast.error("Erro ao enviar solicitação. Tente novamente.");
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
    return (
      <div className="card-elevated rounded-2xl p-8 md:p-12 text-center space-y-6 animate-fade-in">
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
            <button
              onClick={copyProtocol}
              className="p-2 hover:bg-primary/10 rounded-lg transition-colors"
              title="Copiar protocolo"
            >
              <Copy className="w-5 h-5 text-primary" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Guarde este número para acompanhar sua solicitação
          </p>
        </div>
        
        <button
          onClick={handleNewRequest}
          className="btn-primary"
        >
          Fazer Nova Solicitação
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Info Banner */}
      <div className="card-elevated rounded-2xl p-6 border-l-4 border-primary">
        <p className="text-foreground">
          <strong className="text-primary">Como funciona:</strong>{" "}
          Preencha o formulário abaixo com suas informações e descreva detalhadamente
          sua solicitação. Nossa equipe analisará e retornará o mais breve possível.
        </p>
      </div>

      {/* Section 1: Contact Info */}
      <FormSection
        number={1}
        title="Informações de Contato"
        subtitle="Seus dados para retorno"
      >
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Nome completo <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              placeholder="Digite seu nome"
              className="input-field"
              maxLength={100}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              E-mail <span className="text-destructive">*</span>
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              placeholder="seu@email.com"
              className="input-field"
              maxLength={255}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Telefone (opcional)
            </label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleInputChange}
              placeholder="(11) 99999-9999"
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Número do pedido (opcional)
            </label>
            <input
              type="text"
              name="orderNumber"
              value={formData.orderNumber}
              onChange={handleInputChange}
              placeholder="Ex: #12345"
              className="input-field"
            />
          </div>
        </div>
      </FormSection>

      {/* Section 2: Contact Type */}
      <FormSection
        number={2}
        title="Tipo de Solicitação"
        subtitle="Selecione o motivo do seu contato"
      >
        <ContactTypeSelector
          selectedType={formData.contactType}
          onSelect={(type) => setFormData((prev) => ({ ...prev, contactType: type }))}
        />
      </FormSection>

      {/* Section 3: Message Details */}
      <FormSection
        number={3}
        title="Detalhes da Solicitação"
        subtitle="Descreva sua solicitação com o máximo de detalhes"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Assunto
            </label>
            <input
              type="text"
              name="subject"
              value={formData.subject}
              onChange={handleInputChange}
              placeholder="Resumo da sua solicitação"
              className="input-field"
              maxLength={200}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Mensagem <span className="text-destructive">*</span>
            </label>
            <textarea
              name="message"
              value={formData.message}
              onChange={handleInputChange}
              placeholder="Descreva detalhadamente sua solicitação, incluindo informações relevantes como datas, produtos, números de protocolo, etc."
              rows={6}
              className="input-field resize-none"
              maxLength={2000}
            />
            <p className="text-xs text-muted-foreground mt-2 text-right">
              {formData.message.length}/2000 caracteres
            </p>
          </div>
        </div>
      </FormSection>

      {/* Section 4: Attachments */}
      <FormSection
        number={4}
        title="Anexos (opcional)"
        subtitle="Envie imagens ou documentos que ajudem a esclarecer sua solicitação"
      >
        <FileUpload
          files={formData.files}
          onFilesChange={(files) => setFormData((prev) => ({ ...prev, files }))}
        />
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

        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-primary w-full md:w-auto flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Enviando...
            </>
          ) : (
            <>
              <Send className="w-5 h-5" />
              Enviar Solicitação
            </>
          )}
        </button>
      </div>
    </form>
  );
};

export default SACForm;
