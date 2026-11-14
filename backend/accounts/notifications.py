"""Create in-app notifications. Never let a notification break the action that caused it."""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

# Keep each user's list short; older ones are dropped.
KEEP_PER_USER = 100


def notify(user, kind: str, title: str, body: str = "", link: str = ""):
    from .models import Notification

    if user is None:
        return None
    try:
        note = Notification.objects.create(user=user, kind=kind, title=title[:160], body=body[:500], link=link[:200])
        stale = Notification.objects.filter(user=user).values_list("id", flat=True)[KEEP_PER_USER:]
        if stale:
            Notification.objects.filter(id__in=list(stale)).delete()
        return note
    except Exception:  # noqa: BLE001
        logger.exception("Could not create notification %r for user %s", title, getattr(user, "pk", None))
        return None
