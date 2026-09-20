import hmac
import secrets
from datetime import timedelta
from functools import lru_cache

import jwt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import Organisation, User, now

router = APIRouter(prefix="/auth", tags=["Identity"])
bearer = HTTPBearer(auto_error=False)


class Login(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str = Field(max_length=254)
    password: str = Field(max_length=128)


@lru_cache
def demo_secret():
    if settings().jwt_secret:
        return settings().jwt_secret
    path = settings().data_dir / "demo-jwt.key"
    if not path.exists():
        path.write_text(secrets.token_hex(32), encoding="utf-8")
        path.chmod(0o600)
    return path.read_text(encoding="utf-8").strip()


def user_view(user):
    return {"id": user.id, "name": user.name, "email": user.email, "org_id": user.org_id, "role": user.role}


def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)):
    if not credentials:
        raise HTTPException(401, "Sign in required")
    try:
        if settings().demo:
            claims = jwt.decode(credentials.credentials, demo_secret(), algorithms=["HS256"], audience="bhramari-api", issuer="bhramari-demo", options={"require": ["exp", "sub", "iat", "iss", "aud"]})
            user = db.get(User, claims["sub"])
        else:
            config = settings()
            if not config.oidc_issuer or not config.oidc_jwks_url:
                raise HTTPException(503, "OIDC must be configured")
            key = jwks_client().get_signing_key_from_jwt(credentials.credentials)
            claims = jwt.decode(credentials.credentials, key.key, algorithms=["RS256"], audience=config.oidc_audience, issuer=config.oidc_issuer, options={"require": ["exp", "sub", "iat", "iss", "aud"]})
            user = db.scalar(select(User).where(User.oidc_subject == claims["sub"]))
        if not user or not user.active:
            raise HTTPException(403, "Participant is not enrolled or has been disabled")
        return user
    except jwt.PyJWTError as exc:
        raise HTTPException(401, "Invalid or expired access token") from exc


@lru_cache
def jwks_client():
    return jwt.PyJWKClient(settings().oidc_jwks_url, cache_keys=True, lifespan=300)


def require_roles(*roles):
    def authorized(user: User = Depends(current_user)):
        if user.role not in roles:
            raise HTTPException(403, "Your role cannot perform this action")
        return user
    return authorized


def relayer(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
    token = settings().relayer_token
    if not token or not credentials or not hmac.compare_digest(token, credentials.credentials):
        raise HTTPException(401, "Relayer authentication required")


@router.post("/demo")
def demo_login(body: Login, db: Session = Depends(get_db)):
    if not settings().demo:
        raise HTTPException(404, "Demo sign-in is disabled")
    user = db.scalar(select(User).where(User.email == body.email.lower(), User.active.is_(True)))
    if not hmac.compare_digest(body.password, "demo-honey-2026") or not user:
        raise HTTPException(401, "Invalid demo credentials")
    issued = now()
    token = jwt.encode({"sub": user.id, "iss": "bhramari-demo", "aud": "bhramari-api", "iat": issued, "exp": issued + timedelta(hours=2)}, demo_secret(), algorithm="HS256")
    return {"access_token": token, "token_type": "bearer", "expires_in": 7200, "user": user_view(user), "mode": "simulated-demo"}


@router.get("/me")
def me(user: User = Depends(current_user)):
    return user_view(user)


@router.get("/organisations")
def organisations(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return [{"id": org.id, "name": org.name, "kind": org.kind} for org in db.scalars(select(Organisation))]
