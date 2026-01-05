import { MessageSquare, ThumbsUp, AlertCircle, HelpCircle } from "lucide-react";

interface ContactType {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const contactTypes: ContactType[] = [
  {
    id: "reclamacao",
    label: "Reclamação",
    description: "Problemas com produtos ou serviços",
    icon: <AlertCircle className="w-6 h-6" />,
  },
  {
    id: "sugestao",
    label: "Sugestão",
    description: "Ideias para melhorias",
    icon: <MessageSquare className="w-6 h-6" />,
  },
  {
    id: "elogio",
    label: "Elogio",
    description: "Reconheça nosso trabalho",
    icon: <ThumbsUp className="w-6 h-6" />,
  },
  {
    id: "duvida",
    label: "Dúvida",
    description: "Tire suas dúvidas",
    icon: <HelpCircle className="w-6 h-6" />,
  },
];

interface ContactTypeSelectorProps {
  selectedType: string;
  onSelect: (type: string) => void;
}

const ContactTypeSelector = ({ selectedType, onSelect }: ContactTypeSelectorProps) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {contactTypes.map((type) => (
        <button
          key={type.id}
          type="button"
          onClick={() => onSelect(type.id)}
          className={`type-card flex flex-col items-center text-center gap-3 ${
            selectedType === type.id ? "selected" : ""
          }`}
        >
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
              selectedType === type.id
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground"
            }`}
          >
            {type.icon}
          </div>
          <div>
            <p className="font-semibold text-foreground">{type.label}</p>
            <p className="text-xs text-muted-foreground mt-1">{type.description}</p>
          </div>
        </button>
      ))}
    </div>
  );
};

export default ContactTypeSelector;
