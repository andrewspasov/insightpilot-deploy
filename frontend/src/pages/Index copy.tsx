import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sparkles, ArrowRight } from 'lucide-react';

const Index = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center max-w-2xl px-4 animate-in">
        <div className="mb-6 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent shadow-lg">
            <Sparkles className="h-8 w-8 text-primary-foreground" />
          </div>
        </div>
        <h1 className="mb-4 text-5xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          Welcome to InsightPilot
        </h1>
        <p className="text-xl text-muted-foreground mb-8">
          Your AI-powered automation platform for smarter workflows
        </p>
        <Link to="/dashboard">
          <Button size="lg" className="transition-all hover:scale-105 active:scale-95">
            Go to Dashboard
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default Index;
