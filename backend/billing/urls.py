from django.urls import path

from .views import (
    BillingOrderDetailView,
    BillingPassesView,
    BillingSummaryView,
    ChangePassView,
    CreateSubscriptionView,
    SelectToolsView,
    StripeWebhookView,
)

urlpatterns = [
    path("summary/", BillingSummaryView.as_view(), name="billing-summary"),
    path("passes/", BillingPassesView.as_view(), name="billing-passes"),
    path("orders/<int:order_id>/", BillingOrderDetailView.as_view(), name="billing-order-detail"),
    path("create-subscription/", CreateSubscriptionView.as_view(), name="billing-create-subscription"),
    path("change-pass/", ChangePassView.as_view(), name="billing-change-pass"),
    path("select-tools/", SelectToolsView.as_view(), name="billing-select-tools"),
    path("stripe/webhook/", StripeWebhookView.as_view(), name="stripe-webhook"),
]
