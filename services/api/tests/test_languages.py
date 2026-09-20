from bhramari.languages import language, manifest, translate


def test_language_manifest_exposes_all_sarvam_indian_languages():
    capabilities = manifest()
    codes = {item["code"] for item in capabilities["languages"]}
    assert len(codes) == 23
    assert {"as-IN", "brx-IN", "doi-IN", "kok-IN", "ks-IN", "mai-IN", "mni-IN", "sa-IN", "sat-IN", "ur-IN"} <= codes
    assert all(item["text"] and item["stt"] for item in capabilities["languages"])


def test_voice_provider_is_declared_only_when_supported():
    assert "sarvam" in language("od-IN")["tts"]
    assert "elevenlabs" in language("as-IN")["tts"]
    assert language("brx-IN")["tts"] == []


def test_unconfigured_provider_returns_explicit_english_fallback():
    text, provider = translate("Hive needs attention", "brx-IN")
    assert text == "Hive needs attention"
    assert provider == "english_fallback"


def test_madhu_intent_uses_provider_translation_for_any_manifest_language(client, auth, monkeypatch):
    from bhramari import madhu

    monkeypatch.setattr(madhu, "to_english", lambda text, source: "harvest 2 kg")
    response = client.post("/api/v1/madhu/chat", headers=auth("beekeeper"), json={
        "message": "provider transcript", "language": "as-IN", "context_id": "HIVE-MH-001",
    })

    assert response.status_code == 200
    assert response.json()["intent"] == "draft_harvest"
    assert response.json()["draft"]["quantity_g"] == 2_000
