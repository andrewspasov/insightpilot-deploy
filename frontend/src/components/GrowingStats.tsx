import { useEffect, useRef, useState } from "react";
import { TrendingUp, Users, Globe, Zap } from "lucide-react";

interface Stat {
  icon: typeof TrendingUp;
  end: number;
  label: string;
  suffix: string;
  prefix?: string;
}

const stats: Stat[] = [
  { icon: Users, end: 50000, label: "Active Clients", suffix: "+" },
  { icon: Globe, end: 150, label: "Countries", suffix: "+" },
  { icon: Zap, end: 99.9, label: "Uptime", suffix: "%", prefix: "" },
  { icon: TrendingUp, end: 2500, label: "Growth Rate", suffix: "%", prefix: "+" },
];

const useCountAnimation = (end: number, duration: number = 2000, isVisible: boolean) => {
  const [count, setCount] = useState(0);
  const startTime = useRef<number>(0);
  const animationFrame = useRef<number>();

  useEffect(() => {
    if (!isVisible) return;

    const animate = (timestamp: number) => {
      if (!startTime.current) startTime.current = timestamp;
      const progress = Math.min((timestamp - startTime.current) / duration, 1);
      
      // Easing function for smooth animation
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      setCount(Math.floor(end * easeOutQuart));

      if (progress < 1) {
        animationFrame.current = requestAnimationFrame(animate);
      }
    };

    animationFrame.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
      }
    };
  }, [end, duration, isVisible]);

  return count;
};

export const GrowingStats = () => {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isVisible) {
          setIsVisible(true);
        }
      },
      { threshold: 0.3 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, [isVisible]);

  return (
    <section ref={sectionRef} className="py-32 px-6 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-primary/5 to-background" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-3xl animate-pulse" />
      
      <div className="relative z-10 max-w-7xl mx-auto">
        <div className="text-center mb-20">
          <h2 className="text-5xl md:text-6xl font-bold mb-6">
            <span className="text-foreground">Growing at</span>
            <br />
            <span className="bg-gradient-primary bg-clip-text text-transparent">Lightning Speed</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Our numbers speak for themselves. Join the fastest-growing platform in the industry.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map((stat, index) => (
            <StatCard 
              key={stat.label}
              stat={stat}
              isVisible={isVisible}
              delay={index * 0.1}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

const StatCard = ({ 
  stat, 
  isVisible, 
  delay 
}: { 
  stat: Stat; 
  isVisible: boolean; 
  delay: number;
}) => {
  const count = useCountAnimation(stat.end, 2000, isVisible);
  
  const formatNumber = (num: number) => {
    if (stat.suffix === "%") {
      return num.toFixed(1);
    }
    return num.toLocaleString();
  };

  return (
    <div 
      className="glass-card p-8 rounded-2xl text-center group hover:shadow-glow transition-all duration-500 animate-fade-in"
      style={{ animationDelay: `${delay}s` }}
    >
      <div className="w-16 h-16 mx-auto mb-6 rounded-xl bg-gradient-primary flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-strong">
        <stat.icon className="w-8 h-8 text-background" />
      </div>
      
      <div className="text-5xl font-bold mb-3">
        <span className="bg-gradient-accent bg-clip-text text-transparent">
          {stat.prefix}{formatNumber(count)}{stat.suffix}
        </span>
      </div>
      
      <div className="text-muted-foreground font-medium">
        {stat.label}
      </div>
    </div>
  );
};
