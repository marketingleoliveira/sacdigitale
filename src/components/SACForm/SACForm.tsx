import { useState } from "react";
import { Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
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

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 2000));

    setIsSubmitting(false);
    toast.success("Sua mensagem foi enviada com sucesso! Entraremos em contato em breve.");

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
  };

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
