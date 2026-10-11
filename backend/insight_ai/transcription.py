"""Speech-to-text for the InsightPilot AI chat.

Uses OpenAI's transcription endpoint when an OpenAI key is configured,
otherwise falls back to Gemini's inline audio support.
"""

from __future__ import annotations

import base64
import binascii

import requests
from django.conf import settings

from .models import InsightAIUsage
from .services import (
    AIProviderRequestError,
    _extract_gemini_text,
    _preview,
    _setting_int,
    get_ai_model,
    get_api_key,
)

GEMINI_TRANSCRIBE_PROMPT = (
    "Transcribe the following audio to plain text. "
    "Return only the transcription, with no commentary, labels, or quotation marks."
)


def _transcription_model() -> str:
    return str(
        getattr(settings, "INSIGHT_AI_TRANSCRIPTION_MODEL", "") or "whisper-1"
    ).strip()


def transcribe_audio(user, audio_base64: str, mime_type: str = "audio/m4a") -> str:
    try:
        audio_bytes = base64.b64decode(audio_base64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise AIProviderRequestError("The audio could not be decoded.") from exc

    if not audio_bytes:
        raise AIProviderRequestError("The recording was empty.")

    timeout = _setting_int("INSIGHT_AI_TIMEOUT_SECONDS", 45)
    openai_key = get_api_key("openai")

    if openai_key:
        text = _transcribe_openai(audio_bytes, mime_type, openai_key, timeout)
        provider, model = "openai", _transcription_model()
    else:
        text = _transcribe_gemini(audio_base64, mime_type, timeout)
        provider, model = "gemini", get_ai_model("gemini")

    InsightAIUsage.objects.create(
        user=user,
        provider=provider,
        model=model,
        status=InsightAIUsage.STATUS_SUCCESS,
        message_preview="[voice transcription]",
        response_preview=_preview(text),
    )
    return text


def _transcribe_openai(
    audio_bytes: bytes, mime_type: str, api_key: str, timeout: int
) -> str:
    extension = (mime_type.split("/")[-1] or "m4a").split(";")[0]
    try:
        response = requests.post(
            "https://api.openai.com/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {api_key}"},
            files={"file": (f"audio.{extension}", audio_bytes, mime_type)},
            data={"model": _transcription_model()},
            timeout=timeout,
        )
    except requests.RequestException as exc:
        raise AIProviderRequestError("Could not reach the transcription service.") from exc

    if response.status_code >= 400:
        raise AIProviderRequestError("The transcription service rejected the recording.")

    try:
        text = str(response.json().get("text") or "").strip()
    except ValueError as exc:
        raise AIProviderRequestError("The transcription response could not be read.") from exc

    if not text:
        raise AIProviderRequestError("Nothing was heard in the recording.")
    return text


def _transcribe_gemini(audio_base64: str, mime_type: str, timeout: int) -> str:
    model = get_ai_model("gemini")
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent"
    )
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": GEMINI_TRANSCRIBE_PROMPT},
                    {"inline_data": {"mime_type": mime_type, "data": audio_base64}},
                ]
            }
        ]
    }
    try:
        response = requests.post(
            url,
            headers={
                "Content-Type": "application/json",
                "x-goog-api-key": get_api_key("gemini"),
            },
            json=payload,
            timeout=timeout,
        )
    except requests.RequestException as exc:
        raise AIProviderRequestError("Could not reach the transcription service.") from exc

    if response.status_code >= 400:
        raise AIProviderRequestError("The transcription service rejected the recording.")

    text = _extract_gemini_text(response.json()).strip()
    if not text:
        raise AIProviderRequestError("Nothing was heard in the recording.")
    return text
