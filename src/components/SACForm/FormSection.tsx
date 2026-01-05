import { ReactNode } from "react";

interface FormSectionProps {
  number: number;
  title: string;
  subtitle: string;
  children: ReactNode;
}

const FormSection = ({ number, title, subtitle, children }: FormSectionProps) => {
  return (
    <div className="card-elevated rounded-2xl p-6 md:p-8 animate-slide-up">
      <div className="flex items-start gap-4 mb-6">
        <div className="section-number flex-shrink-0">{number}</div>
        <div>
          <h3 className="text-xl font-semibold text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
        </div>
      </div>
      <div className="pl-0 md:pl-14">{children}</div>
    </div>
  );
};

export default FormSection;
