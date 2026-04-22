from __future__ import annotations

from django.utils import timezone
from rest_framework import permissions

from .models import Subscription, SubscriptionItem


STATUS_PRIORITY = {
    Subscription.STATUS_ACTIVE: 3,
    Subscription.STATUS_ON_HOLD: 2,
    Subscription.STATUS_PENDING: 1,
    Subscription.STATUS_CANCELED: 0,
}


def get_current_subscription(user):
    if not user or not getattr(user, "is_authenticated", False):
        return None
    subs = (
        Subscription.objects.filter(user=user)
        .order_by("-created_at")
        .prefetch_related("items__tool")
    )
    if not subs:
        return None
    # Pick the highest priority status, then most recent
    best = None
    best_priority = -1
    for sub in subs:
        priority = STATUS_PRIORITY.get(sub.effective_status, 0)
        if priority > best_priority:
            best = sub
            best_priority = priority
    return best


def has_tool_access(user, tool_key: str) -> bool:
    subscription = get_current_subscription(user)
    if not subscription:
        return False
    if subscription.effective_status not in {
        Subscription.STATUS_ACTIVE,
        Subscription.STATUS_ON_HOLD,
    }:
        return False
    return SubscriptionItem.objects.filter(
        subscription=subscription,
        tool__key=tool_key,
    ).exists()


def is_read_only(user) -> bool:
    subscription = get_current_subscription(user)
    if not subscription:
        return False
    return subscription.effective_status == Subscription.STATUS_ON_HOLD


def can_run_tool(user, tool_key: str) -> bool:
    subscription = get_current_subscription(user)
    if not subscription:
        return False
    if subscription.effective_status != Subscription.STATUS_ACTIVE:
        return False
    return SubscriptionItem.objects.filter(
        subscription=subscription,
        tool__key=tool_key,
    ).exists()


def grace_expired(subscription: Subscription) -> bool:
    if not subscription.grace_until:
        return False
    return timezone.now() >= subscription.grace_until


class ToolAccessPermission(permissions.BasePermission):
    message = "You do not have access to this tool."

    def has_permission(self, request, view):
        tool_key = getattr(view, "tool_key", None)
        if not tool_key:
            return True
        if not request.user or not request.user.is_authenticated:
            return False
        if not has_tool_access(request.user, tool_key):
            return False
        read_only = is_read_only(request.user)
        access_mode = getattr(view, "tool_access_mode", None)
        if access_mode == "write":
            return not read_only
        if request.method in permissions.SAFE_METHODS:
            return True
        return not read_only
