import logoWhite from "@/assets/logo-white.png";

const HeroSection = () => {
  return (
    <section className="hero-gradient text-primary-foreground py-16 pb-32 relative overflow-hidden">
      {/* Decorative wave pattern */}
      <div className="absolute inset-0 opacity-10">
        <svg className="absolute bottom-0 w-full" viewBox="0 0 1440 320" preserveAspectRatio="none">
          <path
            fill="currentColor"
            d="M0,192L48,197.3C96,203,192,213,288,229.3C384,245,480,267,576,250.7C672,235,768,181,864,181.3C960,181,1056,235,1152,234.7C1248,235,1344,181,1392,154.7L1440,128L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"
          />
        </svg>
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="flex flex-col items-center text-center">
          {/* Logo */}
          <div className="mb-6 animate-fade-in">
            <img src={logoWhite} alt="Digitale Têxtil" className="h-24 md:h-32 w-auto" />
          </div>

          <h1 className="text-4xl md:text-5xl font-bold mb-4 animate-slide-up">
            Central de Atendimento
          </h1>
          <p className="text-lg md:text-xl opacity-90 max-w-2xl animate-slide-up" style={{ animationDelay: "0.1s" }}>
            Sua opinião é muito importante para nós. Estamos aqui para ouvir você!
          </p>

          {/* Badge */}
          <div className="mt-6 inline-flex items-center gap-2 bg-primary-foreground/20 backdrop-blur-sm px-5 py-2.5 rounded-full animate-slide-up" style={{ animationDelay: "0.2s" }}>
            <span className="text-lg">💬</span>
            <span className="text-sm font-medium">Responderemos em até 48 horas úteis</span>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
