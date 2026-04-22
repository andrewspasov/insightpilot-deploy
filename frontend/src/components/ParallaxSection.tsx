import { useEffect, useRef, useState } from "react";

export const ParallaxSection = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      if (sectionRef.current) {
        const rect = sectionRef.current.getBoundingClientRect();
        const scrollProgress = -rect.top / (rect.height + window.innerHeight);
        setScrollY(scrollProgress);
      }
    };

    window.addEventListener("scroll", handleScroll);
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <section ref={sectionRef} className="py-32 px-6 relative overflow-hidden min-h-screen flex items-center">
      {/* Background layers with parallax */}
      <div 
        className="absolute inset-0 bg-gradient-to-br from-primary/20 via-accent/10 to-secondary/20"
        style={{ transform: `translateY(${scrollY * 100}px)` }}
      />
      
      <div 
        className="absolute top-1/4 right-10 w-64 h-64 bg-primary/30 rounded-full blur-3xl"
        style={{ transform: `translate(${scrollY * -80}px, ${scrollY * 120}px)` }}
      />
      
      <div 
        className="absolute bottom-1/4 left-10 w-96 h-96 bg-accent/20 rounded-full blur-3xl"
        style={{ transform: `translate(${scrollY * 100}px, ${scrollY * -80}px)` }}
      />
      
      <div 
        className="absolute top-1/2 left-1/2 w-72 h-72 bg-secondary/20 rounded-full blur-3xl"
        style={{ transform: `translate(${scrollY * -60}px, ${scrollY * 100}px) translate(-50%, -50%)` }}
      />

      {/* Content */}
      <div className="relative z-10 max-w-6xl mx-auto text-center">
        <div 
          className="mb-8"
          style={{ transform: `translateY(${scrollY * 50}px)` }}
        >
          <h2 className="text-5xl md:text-7xl font-bold mb-6">
            <span className="text-foreground">Experience the</span>
            <br />
            <span className="bg-gradient-primary bg-clip-text text-transparent">Magic of Motion</span>
          </h2>
        </div>
        
        <p 
          className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto mb-12"
          style={{ transform: `translateY(${scrollY * -30}px)` }}
        >
          Scroll to see the parallax effect in action. Each layer moves at a different speed, 
          creating depth and immersion that brings your content to life.
        </p>
        
        <div 
          className="grid md:grid-cols-3 gap-8 mt-16"
          style={{ transform: `translateY(${scrollY * 20}px)` }}
        >
          {[
            { title: "Depth", desc: "Multiple layers create visual depth" },
            { title: "Motion", desc: "Smooth scrolling animations" },
            { title: "Impact", desc: "Memorable user experience" }
          ].map((item, i) => (
            <div 
              key={item.title}
              className="glass-card p-8 rounded-2xl"
              style={{ 
                transform: `translateY(${scrollY * (30 + i * 10)}px)`,
                opacity: Math.max(0, 1 - scrollY * 0.5)
              }}
            >
              <h3 className="text-2xl font-bold text-primary mb-3">{item.title}</h3>
              <p className="text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
