const companies = [
  "TechCorp", "InnovateLabs", "FutureStack", "CloudBase", "DataFlow",
  "QuantumAI", "NexusHub", "VelocityPro", "ApexSystems", "ZenithTech",
  "PulseDrive", "CoreMatrix", "VectorScale", "FluxDigital", "OrbitSync"
];

export const LogoCarousel = () => {
  return (
    <section className="py-24 px-6 bg-card/30 overflow-hidden">
      <div className="max-w-7xl mx-auto mb-16 text-center">
        <h2 className="text-4xl md:text-5xl font-bold mb-4">
          <span className="text-foreground">Trusted by</span>{" "}
          <span className="bg-gradient-accent bg-clip-text text-transparent">Industry Leaders</span>
        </h2>
        <p className="text-muted-foreground text-lg">
          Join thousands of companies already using our platform
        </p>
      </div>
      
      <div className="relative">
        {/* Gradient overlays */}
        <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-background to-transparent z-10" />
        <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-background to-transparent z-10" />
        
        {/* First row - scrolling left */}
        <div className="flex mb-8 animate-scroll-left">
          {[...companies, ...companies].map((company, i) => (
            <div
              key={`${company}-${i}`}
              className="flex-shrink-0 mx-8 glass-card px-12 py-6 rounded-xl hover:shadow-glow transition-all duration-300 hover:scale-105"
            >
              <span className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent whitespace-nowrap">
                {company}
              </span>
            </div>
          ))}
        </div>
        
        {/* Second row - scrolling right */}
        <div className="flex animate-scroll-right">
          {[...companies.slice().reverse(), ...companies.slice().reverse()].map((company, i) => (
            <div
              key={`${company}-rev-${i}`}
              className="flex-shrink-0 mx-8 glass-card px-12 py-6 rounded-xl hover:shadow-glow transition-all duration-300 hover:scale-105"
            >
              <span className="text-2xl font-bold bg-gradient-accent bg-clip-text text-transparent whitespace-nowrap">
                {company}
              </span>
            </div>
          ))}
        </div>
      </div>
      
      <style>{`
        @keyframes scroll-left {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }
        
        @keyframes scroll-right {
          from {
            transform: translateX(-50%);
          }
          to {
            transform: translateX(0);
          }
        }
        
        .animate-scroll-left {
          animation: scroll-left 40s linear infinite;
        }
        
        .animate-scroll-right {
          animation: scroll-right 40s linear infinite;
        }
      `}</style>
    </section>
  );
};
