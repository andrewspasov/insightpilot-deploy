import { Shield, Lock, FileText, Cookie, Database, UserCheck, Mail } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function Privacy() {
  return (
    <main className="min-h-screen bg-[#0a0a0f] text-white relative overflow-hidden">
      {/* Animated gradient blobs */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[120px] animate-[float_20s_ease-in-out_infinite]" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[120px] animate-[float_25s_ease-in-out_infinite_reverse]" />
      
      {/* Content */}
      <div className="relative z-10 max-w-4xl mx-auto px-6 py-20">
        {/* Header */}
        <div className="text-center mb-16 animate-fade-in">
          <Badge variant="outline" className="mb-4 bg-primary/10 text-primary border-primary/20 px-4 py-1.5">
            Privacy & Compliance
          </Badge>
          <h1 className="text-5xl md:text-6xl font-bold mb-6 tracking-tight" style={{ fontFamily: '-apple-system, system-ui, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Inter", sans-serif' }}>
            Privacy Policy
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            At InsightPilot, we take your data protection seriously. This policy explains how we collect, use, and safeguard your information.
          </p>
          <p className="text-sm text-muted-foreground mt-4">
            Last updated: January 2025
          </p>
        </div>

        {/* Highlighted Callout */}
        <Card className="mb-12 bg-gradient-to-br from-primary/10 to-blue-500/5 border-primary/20 shadow-lg shadow-primary/10 animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <CardContent className="p-8 text-center">
            <Shield className="h-12 w-12 text-primary mx-auto mb-4" />
            <h3 className="text-2xl font-semibold mb-2">We don't sell your data</h3>
            <p className="text-muted-foreground">
              Your information is never sold to third parties. We use it solely to provide and improve our services.
            </p>
          </CardContent>
        </Card>

        {/* Section 1: Information We Collect */}
        <Card className="mb-8 bg-card/50 backdrop-blur-sm border-border/50 hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Database className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-2xl">1. Information We Collect</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground leading-relaxed">
              We collect information necessary to provide you with the best possible experience:
            </p>
            <ul className="space-y-3 ml-4">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span className="text-muted-foreground"><strong className="text-foreground">Account data:</strong> Name, email address, and profile information you provide.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span className="text-muted-foreground"><strong className="text-foreground">Billing information:</strong> Payment details processed securely through third-party providers like Stripe.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span className="text-muted-foreground"><strong className="text-foreground">Usage data:</strong> Features you use, automation configurations, logs, and basic analytics to improve our product.</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* Section 2: How We Use Your Information */}
        <Card className="mb-8 bg-card/50 backdrop-blur-sm border-border/50 hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 animate-fade-in" style={{ animationDelay: '0.3s' }}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-2xl">2. How We Use Your Information</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground leading-relaxed">
              Your data helps us deliver and enhance InsightPilot:
            </p>
            <ul className="space-y-3 ml-4">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span className="text-muted-foreground"><strong className="text-foreground">Operating the service:</strong> Providing automations, AI features, and core functionality.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span className="text-muted-foreground"><strong className="text-foreground">Product improvement:</strong> Analyzing usage patterns to build better features.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span className="text-muted-foreground"><strong className="text-foreground">Security:</strong> Detecting and preventing fraud, abuse, and security incidents.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span className="text-muted-foreground"><strong className="text-foreground">Support:</strong> Responding to your questions and providing assistance.</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* Section 3: Third-Party Services */}
        <Card className="mb-8 bg-card/50 backdrop-blur-sm border-border/50 hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 animate-fade-in" style={{ animationDelay: '0.4s' }}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Lock className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-2xl">3. Third-Party Services</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground leading-relaxed">
              We partner with trusted service providers to deliver InsightPilot, including:
            </p>
            <ul className="space-y-3 ml-4">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span className="text-muted-foreground"><strong className="text-foreground">Payment processors:</strong> Stripe and similar providers handle billing securely.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span className="text-muted-foreground"><strong className="text-foreground">Analytics tools:</strong> We use anonymous analytics to understand product usage.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span className="text-muted-foreground"><strong className="text-foreground">Infrastructure providers:</strong> Hosting and cloud services to keep InsightPilot running smoothly.</span>
              </li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              These providers are bound by strict data protection agreements. We do not sell your data to anyone.
            </p>
          </CardContent>
        </Card>

        {/* Section 4: Cookies & Tracking */}
        <Card className="mb-8 bg-card/50 backdrop-blur-sm border-border/50 hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 animate-fade-in" style={{ animationDelay: '0.5s' }}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Cookie className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-2xl">4. Cookies & Tracking</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground leading-relaxed">
              We use cookies and similar technologies to:
            </p>
            <ul className="space-y-3 ml-4">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span className="text-muted-foreground"><strong className="text-foreground">Authentication:</strong> Keep you logged in and secure.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span className="text-muted-foreground"><strong className="text-foreground">Preferences:</strong> Remember your settings and customizations.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span className="text-muted-foreground"><strong className="text-foreground">Analytics:</strong> Understand how you use InsightPilot to make it better.</span>
              </li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              You can control cookie settings through your browser, though some features may not work without them.
            </p>
          </CardContent>
        </Card>

        {/* Section 5: Data Retention & Deletion */}
        <Card className="mb-8 bg-card/50 backdrop-blur-sm border-border/50 hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 animate-fade-in" style={{ animationDelay: '0.6s' }}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-2xl">5. Data Retention & Deletion</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground leading-relaxed">
              We retain your data while your account is active and for a reasonable period afterward to comply with legal obligations.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              You can request data deletion or anonymization at any time by contacting us. We'll process your request promptly, subject to legal and operational requirements.
            </p>
          </CardContent>
        </Card>

        {/* Section 6: Your Rights & Controls */}
        <Card className="mb-8 bg-card/50 backdrop-blur-sm border-border/50 hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 animate-fade-in" style={{ animationDelay: '0.7s' }}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <UserCheck className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-2xl">6. Your Rights & Controls</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground leading-relaxed">
              You have full control over your personal information:
            </p>
            <ul className="space-y-3 ml-4">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span className="text-muted-foreground"><strong className="text-foreground">Access:</strong> Request a copy of your data at any time.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span className="text-muted-foreground"><strong className="text-foreground">Correction:</strong> Update inaccurate or incomplete information.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span className="text-muted-foreground"><strong className="text-foreground">Export:</strong> Download your data in a portable format.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span className="text-muted-foreground"><strong className="text-foreground">Deletion:</strong> Request permanent removal of your account and data.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span className="text-muted-foreground"><strong className="text-foreground">Unsubscribe:</strong> Opt out of marketing emails anytime.</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* Section 7: Contact */}
        <Card className="mb-12 bg-card/50 backdrop-blur-sm border-border/50 hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 animate-fade-in" style={{ animationDelay: '0.8s' }}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-2xl">7. Contact Us</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground leading-relaxed">
              If you have questions about this Privacy Policy or how we handle your data, please reach out:
            </p>
            <div className="mt-4 p-4 rounded-lg bg-primary/5 border border-primary/10">
              <p className="text-foreground font-medium">Email:</p>
              <a href="mailto:privacy@insightpilot.app" className="text-primary hover:text-primary/80 transition-colors">
                privacy@insightpilot.app
              </a>
            </div>
          </CardContent>
        </Card>

        {/* Footer note */}
        <div className="text-center text-sm text-muted-foreground animate-fade-in" style={{ animationDelay: '0.9s' }}>
          <p>
            This policy may be updated from time to time. We'll notify you of significant changes via email or through the app.
          </p>
        </div>
      </div>
    </main>
  );
}
