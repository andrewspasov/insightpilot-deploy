from django.core.management.base import BaseCommand

from insight_ai.coach_reports import send_due_reports


class Command(BaseCommand):
    help = (
        "Email today's nutrition report to users whose report hour has passed. "
        "Run it hourly (e.g. a Render cron job); each user gets at most one per day."
    )

    def handle(self, *args, **options):
        sent = send_due_reports()
        self.stdout.write(f"Sent {len(sent)} daily report(s).")
