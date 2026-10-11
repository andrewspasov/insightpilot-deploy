from __future__ import annotations

from rest_framework import serializers


class InsightAIHistoryMessageSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=("user", "assistant", "model"))
    content = serializers.CharField(max_length=3000)


class InsightAIChatSerializer(serializers.Serializer):
    message = serializers.CharField(
        max_length=2000,
        trim_whitespace=True,
        allow_blank=True,
        required=False,
        default="",
    )
    history = InsightAIHistoryMessageSerializer(many=True, required=False)
    image_base64 = serializers.CharField(
        max_length=8_000_000,
        required=False,
        allow_blank=True,
        default="",
        trim_whitespace=True,
    )
    mime_type = serializers.CharField(max_length=100, required=False, default="image/jpeg")

    def validate_history(self, value):
        return value[-10:]

    def validate(self, attrs):
        if not attrs.get("message") and not attrs.get("image_base64"):
            raise serializers.ValidationError("Send a message, an image, or both.")
        return attrs
