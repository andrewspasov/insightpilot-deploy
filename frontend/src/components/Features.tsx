import { Zap, Shield, Rocket, Sparkles, TrendingUp, Users } from "lucide-react";

const features = [
  {
    icon: Zap,
    title: "Lightning Fast",
    description: "Optimized performance that delivers blazing fast load times and smooth interactions.",
  },
  {
    icon: Shield,
    title: "Secure by Design",
    description: "Enterprise-grade security measures to keep your data safe and protected.",
  },
  {
    icon: Rocket,
    title: "Easy to Scale",
    description: "Grow from prototype to production seamlessly with our flexible infrastructure.",
  },
  {
    icon: Sparkles,
    title: "Beautiful UI",
    description: "Stunning interfaces that delight users and elevate your brand experience.",
  },
  {
    icon: TrendingUp,
    title: "Analytics",
    description: "Deep insights and real-time analytics to help you make data-driven decisions.",
  },
  {
    icon: Users,
    title: "Team Collaboration",
    description: "Work together seamlessly with powerful collaboration tools built right in.",
  },
];

export const Features = () => {
  return (
    <section className="py-32 px-6 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-card/20 to-background" />
      <div className="absolute top-1/2 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
      
      <div className="relative z-10 max-w-7xl mx-auto">
        <div className="text-center mb-20">
          <h2 className="text-5xl md:text-6xl font-bold mb-6">
            <span className="text-foreground">Powerful Features for</span>
            <br />
            <span className="bg-gradient-primary bg-clip-text text-transparent">Modern Teams</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Everything you need to build exceptional products and deliver amazing user experiences.
          </p>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div
              key={feature.title}
              className="group glass-card p-8 rounded-2xl hover:shadow-glow transition-all duration-500 animate-fade-in"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="w-14 h-14 rounded-xl bg-gradient-primary flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 shadow-strong">
                <feature.icon className="w-7 h-7 text-background" />
              </div>
              <h3 className="text-2xl font-semibold mb-3 text-foreground group-hover:text-primary transition-colors">
                {feature.title}
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
