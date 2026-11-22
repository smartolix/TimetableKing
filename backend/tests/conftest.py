import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool

from app.db import Base, make_engine
from app.main import create_app


@pytest.fixture
def client():
    engine = make_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with TestClient(create_app(engine)) as c:
        yield c


def wait_for(client: TestClient, timetable_id: int, timeout: float = 60) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        tt = client.get(f"/api/timetables/{timetable_id}").json()
        if tt["status"] in ("done", "failed"):
            return tt
        time.sleep(0.2)
    raise AssertionError("Berechnung wurde nicht fertig")
