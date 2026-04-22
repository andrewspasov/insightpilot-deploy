from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from django.db import IntegrityError, transaction
from django.utils import timezone

from .models import AlertRule, NotificationEvent, Track, TrendSnapshot


def _safe_float(value: Any) -> Optional[float]:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def extract_metrics(snapshot: TrendSnapshot) -> Dict[str, Optional[float]]:
    metrics = snapshot.metrics or {}

    total_views = (
        metrics.get("total_views")
        or metrics.get("search_volume")
        or metrics.get("searchVolume")
    )
    video_count = (
        metrics.get("video_count")
        or metrics.get("mention_count")
        or metrics.get("productCount")
    )
    avg_views = (
        metrics.get("avg_views")
        or metrics.get("price_index")
        or metrics.get("avgPrice")
    )
    engagement_rate = (
        metrics.get("engagement_rate")
        or metrics.get("sentiment_score")
        or metrics.get("sentimentScore")
    )

    return {
        "total_views": _safe_float(total_views),
        "video_count": _safe_float(video_count),
        "avg_views": _safe_float(avg_views),
        "engagement_rate": _safe_float(engagement_rate),
    }


def _pct_change(latest: Optional[float], previous: Optional[float]) -> Optional[float]:
    if latest is None or previous is None or previous <= 0:
        return None
    return ((latest - previous) / previous) * 100.0


@dataclass
class AlertEventPayload:
    user_id: int
    user_email: str
    track_id: int
    rule_id: int
    rule_type: str
    message: str
    run_at: str
    metrics: Dict[str, Any]
    channels: List[str]
    snapshot_id: Optional[int]


def _build_event_message(
    rule: AlertRule,
    track: Track,
    latest: TrendSnapshot,
    prev: Optional[TrendSnapshot],
    metrics_latest: Dict[str, Optional[float]],
) -> Tuple[str, Dict[str, Any]]:
    latest_views = metrics_latest.get("total_views")
    engagement = metrics_latest.get("engagement_rate")
    prev_views = None
    if prev:
        prev_metrics = extract_metrics(prev)
        prev_views = prev_metrics.get("total_views")

    if rule.rule_type == AlertRule.RULE_ENGAGEMENT_GT:
        engagement_pct = (engagement or 0.0) * 100.0
        message = (
            f"Engagement: '{track.name}' {engagement_pct:.2f}% "
            f"above {rule.threshold_value:.2f}%"
        )
    elif rule.rule_type == AlertRule.RULE_VIEWS_SPIKE_PCT:
        pct = _pct_change(latest_views, prev_views) or 0.0
        message = (
            f"Spike: '{track.name}' views +{pct:.1f}% "
            f"({int(prev_views or 0)} -> {int(latest_views or 0)})"
        )
    elif rule.rule_type == AlertRule.RULE_VIEWS_DROP_PCT:
        pct = _pct_change(latest_views, prev_views) or 0.0
        message = (
            f"Drop: '{track.name}' views {pct:.1f}% "
            f"({int(prev_views or 0)} -> {int(latest_views or 0)})"
        )
    else:
        message = (
            f"Views: '{track.name}' {int(latest_views or 0)} "
            f"above {int(rule.threshold_value)}"
        )

    metrics_summary = {
        "total_views": latest_views,
        "prev_views": prev_views,
        "engagement_rate": engagement,
    }
    return message, metrics_summary


def evaluate_alerts_for_track(track: Track) -> List[AlertEventPayload]:
    """
    Evaluate enabled alert rules for a track and return event payloads.
    """
    now = timezone.now()
    latest = track.snapshots.order_by("-run_at").first()
    if not latest:
        return []

    prev = (
        track.snapshots.filter(run_at__lt=latest.run_at)
        .order_by("-run_at")
        .first()
    )

    rules = AlertRule.objects.filter(track=track, enabled=True)
    if not rules:
        return []

    metrics_latest = extract_metrics(latest)
    events: List[AlertEventPayload] = []

    for rule in rules:
        if rule.cooldown_minutes and rule.last_triggered_at:
            cooldown_until = rule.last_triggered_at + timezone.timedelta(
                minutes=rule.cooldown_minutes
            )
            if cooldown_until > now:
                continue

        triggered = False
        if rule.rule_type == AlertRule.RULE_ENGAGEMENT_GT:
            engagement = metrics_latest.get("engagement_rate")
            if engagement is not None:
                triggered = (engagement * 100.0) >= rule.threshold_value
        elif rule.rule_type == AlertRule.RULE_VIEWS_SPIKE_PCT:
            if prev:
                pct = _pct_change(
                    metrics_latest.get("total_views"),
                    extract_metrics(prev).get("total_views"),
                )
                if pct is not None and pct >= rule.threshold_value:
                    triggered = True
        elif rule.rule_type == AlertRule.RULE_VIEWS_DROP_PCT:
            if prev:
                pct = _pct_change(
                    metrics_latest.get("total_views"),
                    extract_metrics(prev).get("total_views"),
                )
                if pct is not None and pct <= (-1.0 * rule.threshold_value):
                    triggered = True
        elif rule.rule_type == AlertRule.RULE_VIEWS_GT:
            latest_views = metrics_latest.get("total_views")
            if latest_views is not None and latest_views >= rule.threshold_value:
                triggered = True

        if not triggered:
            continue

        message, metrics_summary = _build_event_message(
            rule, track, latest, prev, metrics_latest
        )

        created_event = False
        with transaction.atomic():
            rule.last_triggered_at = now
            rule.save(update_fields=["last_triggered_at"])

            try:
                NotificationEvent.objects.create(
                    user=rule.user,
                    track=track,
                    rule=rule,
                    snapshot=latest,
                    event_type=rule.rule_type,
                    status=NotificationEvent.STATUS_PENDING,
                    channels=rule.channels or ["email"],
                    payload={
                        "user_id": rule.user_id,
                        "user_email": rule.user.email,
                        "track_id": track.id,
                        "track_name": track.name,
                        "rule_id": rule.id,
                        "rule_type": rule.rule_type,
                        "message": message,
                        "metrics": metrics_summary,
                        "run_at": latest.run_at.isoformat(),
                    },
                )
                created_event = True
            except IntegrityError:
                created_event = False

        if created_event:
            events.append(
                AlertEventPayload(
                    user_id=rule.user_id,
                    user_email=rule.user.email,
                    track_id=track.id,
                    rule_id=rule.id,
                    rule_type=rule.rule_type,
                    message=message,
                    run_at=latest.run_at.isoformat(),
                    metrics=metrics_summary,
                    channels=rule.channels or ["email"],
                    snapshot_id=latest.id,
                )
            )

    return events


def evaluate_alerts_for_tracks(track_ids: List[int]) -> List[AlertEventPayload]:
    events: List[AlertEventPayload] = []
    tracks = Track.objects.filter(id__in=track_ids)
    for track in tracks:
        events.extend(evaluate_alerts_for_track(track))
    return events


def build_weekly_digest(now=None) -> List[Dict[str, Any]]:
    now = now or timezone.now()
    window_start = now - timezone.timedelta(days=7)

    digests: List[Dict[str, Any]] = []
    for track in Track.objects.select_related("owner").all():
        if track.owner_id is None:
            continue

        latest = track.snapshots.filter(run_at__gte=window_start).order_by("-run_at").first()
        if not latest:
            continue

        target_time = latest.run_at - timezone.timedelta(days=7)
        prev = track.snapshots.filter(run_at__lte=target_time).order_by("-run_at").first()
        if not prev:
            prev = track.snapshots.filter(run_at__gte=window_start).order_by("run_at").first()

        metrics_latest = extract_metrics(latest)
        metrics_prev = extract_metrics(prev) if prev else {}

        latest_views = metrics_latest.get("total_views") or 0.0
        prev_views = metrics_prev.get("total_views") or 0.0
        pct = _pct_change(latest_views, prev_views)
        abs_change = latest_views - prev_views
        engagement = metrics_latest.get("engagement_rate") or 0.0

        digests.append(
            {
                "user_id": track.owner_id,
                "user_email": track.owner.email,
                "track_id": track.id,
                "track_name": track.name,
                "latest_views": latest_views,
                "prev_views": prev_views,
                "views_pct_change": pct,
                "views_abs_change": abs_change,
                "engagement_rate": engagement,
            }
        )

    user_map: Dict[int, List[Dict[str, Any]]] = {}
    for item in digests:
        user_map.setdefault(item["user_id"], []).append(item)

    output: List[Dict[str, Any]] = []
    for user_id, items in user_map.items():
        winners = sorted(
            [i for i in items if i["views_pct_change"] is not None],
            key=lambda i: i["views_pct_change"],
            reverse=True,
        )[:5]
        losers = sorted(
            [i for i in items if i["views_pct_change"] is not None],
            key=lambda i: i["views_pct_change"],
        )[:5]
        biggest_mover = max(items, key=lambda i: abs(i["views_abs_change"]), default=None)
        best_engagement = max(items, key=lambda i: i["engagement_rate"], default=None)

        lines = ["Weekly NTR Digest", ""]
        if winners:
            lines.append("Top winners:")
            for item in winners:
                lines.append(
                    f"- {item['track_name']}: {item['views_pct_change']:.1f}%"
                )
            lines.append("")
        if losers:
            lines.append("Top losers:")
            for item in losers:
                lines.append(
                    f"- {item['track_name']}: {item['views_pct_change']:.1f}%"
                )
            lines.append("")
        if biggest_mover:
            lines.append(
                f"Biggest mover: {biggest_mover['track_name']} ({biggest_mover['views_abs_change']:.0f} views)"
            )
        if best_engagement:
            lines.append(
                f"Best engagement: {best_engagement['track_name']} ({best_engagement['engagement_rate']*100.0:.2f}%)"
            )

        output.append(
            {
                "user_id": user_id,
                "email": items[0]["user_email"],
                "channels": ["email"],
                "title": "Weekly NTR Digest",
                "message": "\n".join(lines),
                "meta": {
                    "winners": winners,
                    "losers": losers,
                    "biggest_mover": biggest_mover,
                    "best_engagement": best_engagement,
                },
            }
        )

    return output
