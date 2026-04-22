import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { ProfileDetailsCard } from '@/components/profile/ProfileDetailsCard';
import { SecurityCard } from '@/components/profile/SecurityCard';
import { SubscriptionCard } from '@/components/profile/SubscriptionCard';
import { ToolsGrid } from '@/components/profile/ToolsGrid';
import { BillingHistoryTable } from '@/components/profile/BillingHistoryTable';
import { useEntitlements } from '@/hooks/use-entitlements';
import { apiGet, apiPatch } from '@/lib/api';
import { withApiPath } from '@/lib/env';
import type { User } from '@/types';

type CurrentUserResponse = {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  date_joined: string;
  avatar_url: string | null;
};

type CurrentUserUpdateBody = {
  full_name: string;
  email: string;
};

function toProfileUser(data?: CurrentUserResponse): User {
  const fullName =
    data?.full_name?.trim() ||
    `${data?.first_name ?? ''} ${data?.last_name ?? ''}`.trim() ||
    data?.username ||
    'User';

  const avatarSeed = encodeURIComponent(data?.username || data?.email || fullName);
  const avatarUrl = data?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${avatarSeed}`;

  return {
    id: String(data?.id ?? 'current-user'),
    email: data?.email ?? '',
    fullName,
    avatarUrl,
    createdAt: data?.date_joined ? new Date(data.date_joined) : new Date(),
  };
}

export default function Profile() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    data: currentUser,
    isLoading: isUserLoading,
    error: userError,
  } = useQuery<CurrentUserResponse>({
    queryKey: ['current-user'],
    queryFn: () => apiGet<CurrentUserResponse>('/me/'),
  });

  const {
    data: billingSummary,
    isLoading: isBillingLoading,
    error: billingError,
  } = useEntitlements();

  const updateProfile = useMutation({
    mutationFn: (payload: CurrentUserUpdateBody) =>
      apiPatch<CurrentUserUpdateBody, CurrentUserResponse>('/me/', payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(['current-user'], updated);
    },
  });

  const uploadAvatar = useMutation({
    mutationFn: async (file: File) => {
      const token = localStorage.getItem('access_token');

      const formData = new FormData();
      formData.append('avatar', file);

      const response = await fetch(withApiPath('/me/avatar/'), {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message =
          typeof data?.detail === 'string'
            ? data.detail
            : typeof data?.error === 'string'
              ? data.error
              : `Avatar upload failed (${response.status})`;
        throw new Error(message);
      }

      return data as CurrentUserResponse;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['current-user'], updated);
    },
  });

  const user = useMemo(() => toProfileUser(currentUser), [currentUser]);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <ProfileHeader user={user} />

      {isUserLoading && (
        <p className="text-sm text-muted-foreground">Loading profile details...</p>
      )}

      {(userError || billingError) && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Some profile information could not be loaded. Please refresh and try again.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <ProfileDetailsCard
          user={user}
          isSaving={updateProfile.isPending}
          isUploadingAvatar={uploadAvatar.isPending}
          onSave={(payload) =>
            updateProfile.mutateAsync({
              full_name: payload.fullName,
              email: payload.email,
            })
          }
          onUploadAvatar={(file) => uploadAvatar.mutateAsync(file)}
        />
        <SecurityCard email={user.email} />
      </div>

      <SubscriptionCard
        summary={billingSummary ?? null}
        isLoading={isBillingLoading}
        onManageSubscription={() => navigate('/dashboard/billing')}
      />

      <ToolsGrid
        tools={billingSummary?.tools ?? []}
        isLoading={isBillingLoading}
        onManageTools={() => navigate('/dashboard/billing')}
      />

      <BillingHistoryTable
        orders={billingSummary?.orders ?? []}
        isLoading={isBillingLoading}
      />
    </div>
  );
}
