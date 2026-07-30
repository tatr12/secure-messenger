from types import SimpleNamespace

from app.config import settings
from app.routers.websocket import get_websocket_credentials
from app.services import build_verification_url


def make_websocket(protocols: str = "", query_token: str | None = None):
    return SimpleNamespace(
        headers={"sec-websocket-protocol": protocols},
        query_params={"token": query_token} if query_token else {},
    )


def test_websocket_token_prefers_subprotocol_over_query_string():
    websocket = make_websocket(
        protocols="voiden, voiden.auth.header-token",
        query_token="legacy-query-token",
    )

    token, selected_protocol = get_websocket_credentials(websocket)

    assert token == "header-token"
    assert selected_protocol == "voiden"


def test_websocket_query_token_remains_compatible_for_existing_clients():
    token, selected_protocol = get_websocket_credentials(
        make_websocket(query_token="legacy-query-token")
    )

    assert token == "legacy-query-token"
    assert selected_protocol is None


def test_transport_configuration_uses_explicit_origins_and_public_url(monkeypatch):
    monkeypatch.setattr(
        settings,
        "CORS_ORIGINS",
        " https://voiden.example, https://admin.voiden.example ",
    )
    monkeypatch.setattr(settings, "PUBLIC_BASE_URL", "https://voiden.example/")

    assert settings.cors_origins == [
        "https://voiden.example",
        "https://admin.voiden.example",
    ]
    assert build_verification_url("token with spaces") == (
        "https://voiden.example/verify?token=token+with+spaces"
    )
