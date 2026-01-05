import HeroSection from "@/components/SACForm/HeroSection";
import SACForm from "@/components/SACForm/SACForm";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <HeroSection />
      
      {/* Main Content - overlapping the hero */}
      <main className="container mx-auto px-4 -mt-16 relative z-10 pb-16">
        <div className="max-w-3xl mx-auto">
          <SACForm />
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-card border-t border-border py-8">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground">
            © 2025 Digital e Têxtil. Todos os direitos reservados.
          </p>
          <div className="flex items-center justify-center gap-6 mt-4">
            <a href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">
              Termos de Uso
            </a>
            <a href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">
              Política de Privacidade
            </a>
            <a href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">
              Contato
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
