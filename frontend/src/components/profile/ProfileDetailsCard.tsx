import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { User } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { Loader2, Check, Upload } from 'lucide-react';

interface ProfileDetailsCardProps {
  user: User;
  isSaving?: boolean;
  onSave: (payload: { fullName: string; email: string }) => Promise<void>;
  isUploadingAvatar?: boolean;
  onUploadAvatar?: (file: File) => Promise<void>;
}

export function ProfileDetailsCard({
  user,
  isSaving = false,
  onSave,
  isUploadingAvatar = false,
  onUploadAvatar,
}: ProfileDetailsCardProps) {
  const [isSuccess, setIsSuccess] = useState(false);
  const [formData, setFormData] = useState({
    fullName: user.fullName,
    email: user.email,
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setFormData({
      fullName: user.fullName,
      email: user.email,
    });
  }, [user.id, user.fullName, user.email]);

  const handleSave = async () => {
    // Basic validation
    if (!formData.fullName.trim()) {
      toast({
        title: 'Error',
        description: 'Name is required',
        variant: 'destructive',
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      toast({
        title: 'Error',
        description: 'Please enter a valid email address',
        variant: 'destructive',
      });
      return;
    }

    setIsSuccess(false);

    try {
      await onSave({
        fullName: formData.fullName.trim(),
        email: formData.email.trim(),
      });
      setIsSuccess(true);
      toast({
        title: 'Success',
        description: 'Your profile has been updated successfully',
      });
      setTimeout(() => setIsSuccess(false), 2000);
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Could not update your profile',
        variant: 'destructive',
      });
    }
  };

  const triggerFilePicker = () => {
    if (isUploadingAvatar) return;
    fileInputRef.current?.click();
  };

  const handleAvatarSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    event.target.value = '';
    if (!selectedFile) return;

    if (!onUploadAvatar) {
      toast({
        title: 'Upload unavailable',
        description: 'Avatar upload is not configured for this page.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await onUploadAvatar(selectedFile);
      toast({
        title: 'Photo updated',
        description: 'Your profile photo has been updated.',
      });
    } catch (error) {
      toast({
        title: 'Could not upload photo',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card className="hover-lift animate-scale-in">
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Update your personal information</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Profile Picture */}
        <div className="flex items-center gap-4">
          <div className="relative group">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.fullName}
                className="h-20 w-20 rounded-full border-2 border-border"
              />
            ) : (
              <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center">
                <span className="text-2xl font-semibold text-muted-foreground">
                  {user.fullName.charAt(0)}
                </span>
              </div>
            )}
            <div
              className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
              onClick={triggerFilePicker}
            >
              <Upload className="h-6 w-6 text-white" />
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarSelected}
          />
          <Button
            variant="outline"
            onClick={triggerFilePicker}
            disabled={isUploadingAvatar}
          >
            {isUploadingAvatar ? 'Uploading...' : 'Upload new photo'}
          </Button>
        </div>

        {/* Form fields */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name</Label>
            <Input
              id="fullName"
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              placeholder="Enter your full name"
              className="transition-all focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="Enter your email"
              className="transition-all focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>

        {/* Save button */}
        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full sm:w-auto transition-all hover:scale-105 active:scale-95"
        >
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isSuccess && <Check className="mr-2 h-4 w-4" />}
          {isSaving ? 'Saving...' : isSuccess ? 'Saved!' : 'Save changes'}
        </Button>
      </CardContent>
    </Card>
  );
}
