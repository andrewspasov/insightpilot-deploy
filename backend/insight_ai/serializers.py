from __future__ import annotations

from rest_framework import serializers


class InsightAIHistoryMessageSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=("user", "assistant", "model"))
    content = serializers.CharField(max_length=3000)


class InsightAIChatSerializer(serializers.Serializer):
    message = serializers.CharField(max_length=2000, trim_whitespace=True)
    history = InsightAIHistoryMessageSerializer(many=True, required=False)

    def validate_history(self, value):
        return value[-10:]
