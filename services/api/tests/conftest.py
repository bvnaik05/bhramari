import os
import shutil
import tempfile

import pytest
from fastapi.testclient import TestClient


TEST_DATA = tempfile.mkdtemp(prefix="bhramari-tests-")
os.environ["BHRAMARI_DEMO"] = "true"
os.environ["BHRAMARI_DATA_DIR"] = TEST_DATA
os.environ["BHRAMARI_DATABASE_URL"] = f"sqlite:///{TEST_DATA.replace(chr(92), '/')}/bhramari.db"
os.environ["BHRAMARI_RELAYER_TOKEN"] = "test-relayer-secret"

from bhramari.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as session:
        yield session
    shutil.rmtree(TEST_DATA, ignore_errors=True)


def login(client, role):
    response = client.post("/api/v1/auth/demo", json={
        "email": f"{role}@bhramari.local", "password": "demo-honey-2026"
    })
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture
def auth(client):
    return lambda role: login(client, role)
