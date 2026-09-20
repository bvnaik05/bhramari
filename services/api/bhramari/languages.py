"""Provider-backed language capabilities, translation, speech input and speech output."""

import json
from functools import lru_cache

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel, Field

from .auth import current_user
from .config import settings
from .models import User

router = APIRouter(prefix="/languages", tags=["Languages and voice"])


class SynthesisInput(BaseModel):
    text: str = Field(min_length=1, max_length=2500)
    language: str


@lru_cache
def manifest():
    with settings().language_manifest.open(encoding="utf-8") as source:
        return json.load(source)


def language(code):
    item = next((item for item in manifest()["languages"] if item["code"] == code), None)
    if not item:
        raise HTTPException(422, "Select a language exposed by the capabilities endpoint")
    return item


@router.get("")
def capabilities():
    config = settings()
    providers = {"sarvam": bool(config.sarvam_api_key),
                 "elevenlabs": bool(config.elevenlabs_api_key and config.elevenlabs_voice_id)}
    return {**manifest(), "providers": providers,
            "selection_policy": "Sarvam for Indian speech where Bulbul supports it, then ElevenLabs v3; text stays available for all listed languages.",
            "live_voice": any(providers.values())}


@router.post("/synthesize")
def synthesize(body: SynthesisInput, _: User = Depends(current_user)):
    data, media_type, provider = generate_speech(body.text, body.language)
    return Response(data, media_type=media_type, headers={"X-Voice-Provider": provider})


def generate_speech(text, language_code):
    item = language(language_code)
    config = settings()
    if "sarvam" in item["tts"] and config.sarvam_api_key:
        result = request_json("POST", f"{config.sarvam_api_url}/text-to-speech",
            headers={"api-subscription-key": config.sarvam_api_key},
            json={"text": text, "language_code": language_code, "model": "bulbul:v3",
                  "speaker": "shubh", "output_audio_codec": "mp3"})
        import base64
        return base64.b64decode(result["audios"][0]), "audio/mpeg", "sarvam"
    if "elevenlabs" in item["tts"] and config.elevenlabs_api_key and config.elevenlabs_voice_id:
        data = request_bytes("POST", f"{config.elevenlabs_api_url}/v1/text-to-speech/{config.elevenlabs_voice_id}",
            headers={"xi-api-key": config.elevenlabs_api_key, "Accept": "audio/mpeg"},
            json={"text": text, "model_id": "eleven_v3"})
        return data, "audio/mpeg", "elevenlabs"
    raise HTTPException(503, "No configured voice provider supports this language. Text remains available.")


@router.post("/transcribe")
async def transcribe(audio: UploadFile = File(), language_code: str = Form(default="unknown"),
                     _: User = Depends(current_user)):
    config = settings()
    if not config.sarvam_api_key:
        raise HTTPException(503, "Configure Sarvam for Indian-language speech input")
    if language_code != "unknown":
        language(language_code)
    content = await audio.read(3_000_001)
    if len(content) > 3_000_000:
        raise HTTPException(413, "Audio exceeds the 3 MB interactive limit")
    result = request_json("POST", f"{config.sarvam_api_url}/speech-to-text",
        headers={"api-subscription-key": config.sarvam_api_key},
        files={"file": (audio.filename or "recording.webm", content, audio.content_type or "audio/webm")},
        data={"model": "saaras:v3", "mode": "transcribe", "language_code": language_code})
    return {"transcript": result["transcript"], "language": result.get("language_code"), "provider": "sarvam"}


def translate(text, target, source="en-IN"):
    if target == source:
        return text, "original"
    language(target)
    config = settings()
    if not config.sarvam_api_key:
        return text, "english_fallback"
    result = request_json("POST", f"{config.sarvam_api_url}/translate",
        headers={"api-subscription-key": config.sarvam_api_key},
        json={"input": text, "source_language_code": source, "target_language_code": target,
              "model": "sarvam-translate:v1"})
    return result["translated_text"], "sarvam"


def to_english(text, source):
    return translate(text, "en-IN", source)[0] if source != "en-IN" else text


def request_json(method, url, **kwargs):
    try:
        with httpx.Client(timeout=20) as client:
            response = client.request(method, url, **kwargs)
            response.raise_for_status()
            return response.json()
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        raise HTTPException(502, "The language provider could not complete this request") from exc


def request_bytes(method, url, **kwargs):
    try:
        with httpx.Client(timeout=30) as client:
            response = client.request(method, url, **kwargs)
            response.raise_for_status()
            return response.content
    except httpx.HTTPError as exc:
        raise HTTPException(502, "The language provider could not complete this request") from exc
