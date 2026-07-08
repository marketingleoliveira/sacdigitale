import { Link } from "react-router-dom";
import HeroSection from "@/components/SACForm/HeroSection";
import SACForm from "@/components/SACForm/SACForm";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";

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
          <div className="mt-6 flex justify-center">
            <Button
              asChild
              size="lg"
              className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg hover:shadow-xl transition-all duration-200 font-semibold px-8 py-6 rounded-xl border-2 border-primary/20 hover:-translate-y-0.5"
            >
              <Link to="/admin/login">
                <Lock className="h-4 w-4 mr-2" />
                Área Administrativa
              </Link>
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
