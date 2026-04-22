import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

declare global {
  interface Window {
    Calendly?: {
      initPopupWidget: (options: { url: string }) => void;
    };
  }
}

export const CTA = () => {
  return (
    <section className="py-32 px-6 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-gradient-hero animate-gradient opacity-20" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/20 rounded-full blur-3xl animate-pulse" />
      
      <div className="relative z-10 max-w-4xl mx-auto text-center">
        <div className="glass-card p-12 md:p-16 rounded-3xl animate-glow">
          <h2 className="text-4xl md:text-6xl font-bold mb-6">
            <span className="text-foreground">Ready to Get</span>
            <br />
            <span className="bg-gradient-accent bg-clip-text text-transparent">Started?</span>
          </h2>
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
            Join thousands of teams already building amazing products. 
            Start your free trial today, no credit card required.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="group bg-primary hover:bg-primary/90 text-primary-foreground shadow-glow text-lg px-8">
              Start Free Trial
              <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-border/50 hover:bg-card/50 backdrop-blur-sm text-lg px-8"
              type="button"
              onClick={() => {
                if (window.Calendly) {
                  window.Calendly.initPopupWidget({
                    url: "https://calendly.com/andrewspasov271997/30min",
                  });
                }
              }}
            >
              Schedule Demo
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-6">
            14-day free trial • No credit card required • Cancel anytime
          </p>
        </div>
      </div>
    </section>
  );
};
