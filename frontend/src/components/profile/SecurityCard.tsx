import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { withBackendPath } from '@/lib/env';
import { Shield, Loader2, Mail } from 'lucide-react';

interface SecurityCardProps {
  email: string;
}

export function SecurityCard({ email }: SecurityCardProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handlePasswordReset = async () => {
    if (!email) {
      toast({
        title: 'Email required',
        description: 'Your account email is missing. Refresh the page and try again.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(withBackendPath('/accounts/password-reset/'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errorMessage =
          typeof data?.error === 'string'
            ? data.error
            : typeof data?.detail === 'string'
              ? data.detail
              : 'Could not send password reset email.';
        throw new Error(errorMessage);
      }

      toast({
        title: 'Password reset email sent',
        description: 'Check your inbox for instructions to reset your password.',
      });
    } catch (error) {
      toast({
        title: 'Could not send reset email',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="hover-lift animate-scale-in">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-warning" />
          <CardTitle>Security</CardTitle>
        </div>
        <CardDescription>
          Update your login details and keep your account secure
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="rounded-lg bg-muted/50 p-4 border border-border">
            <div className="flex items-start gap-3">
              <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium mb-1">Password Reset</p>
                <p className="text-sm text-muted-foreground">
                  We'll send you an email with instructions to reset your password
                </p>
              </div>
            </div>
          </div>

          <Button
            onClick={handlePasswordReset}
            disabled={isLoading}
            variant="outline"
            className="w-full sm:w-auto transition-all hover:scale-105 active:scale-95"
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send password reset email
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
