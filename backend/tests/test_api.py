import io

from openpyxl import load_workbook

from tests.conftest import wait_for


def setup_small(client):
    client.put(
        "/api/settings",
        json={
            "school_name": "Testschule",
            "days": 5,
            "periods": [{"label": f"{i + 1}.", "break_after": i == 1} for i in range(6)],
        },
    )
    m = client.post("/api/subjects", json={"short": "M", "name": "Mathe", "color": "#4f7cff"}).json()
    d = client.post("/api/subjects", json={"short": "D", "name": "Deutsch"}).json()
    t1 = client.post("/api/teachers", json={"short": "HUB", "unavailable": [[0, 0], [0, 1]]}).json()
    t2 = client.post("/api/teachers", json={"short": "GRU", "max_per_day": 3}).json()
    r = client.post("/api/rooms", json={"short": "R1"}).json()
    c1 = client.post("/api/classes", json={"name": "1a", "home_room_id": r["id"]}).json()
    c2 = client.post("/api/classes", json={"name": "1b"}).json()
    lessons = [
        client.post(
            "/api/lessons",
            json={
                "subject_id": m["id"],
                "class_ids": [c1["id"]],
                "teacher_ids": [t1["id"]],
                "periods_per_week": 4,
            },
        ).json(),
        client.post(
            "/api/lessons",
            json={
                "subject_id": d["id"],
                "class_ids": [c1["id"]],
                "teacher_ids": [t2["id"]],
                "periods_per_week": 4,
                "double_periods": 1,
            },
        ).json(),
        client.post(
            "/api/lessons",
            json={
                "subject_id": m["id"],
                "class_ids": [c2["id"]],
                "teacher_ids": [t1["id"]],
                "periods_per_week": 3,
            },
        ).json(),
    ]
    return {"m": m, "t1": t1, "t2": t2, "r": r, "c1": c1, "c2": c2, "lessons": lessons}


def test_crud_and_unique(client):
    a = client.post("/api/subjects", json={"short": "M"})
    assert a.status_code == 201
    assert client.post("/api/subjects", json={"short": "M"}).status_code == 409
    sid = a.json()["id"]
    assert client.put(f"/api/subjects/{sid}", json={"short": "MA", "name": "Mathe"}).json()["short"] == "MA"
    assert client.delete(f"/api/subjects/{sid}").status_code == 204
    assert client.get("/api/subjects").json() == []


def test_subject_in_use_cannot_be_deleted(client):
    data = setup_small(client)
    assert client.delete(f"/api/subjects/{data['m']['id']}").status_code == 409


def test_settings_roundtrip(client):
    setup_small(client)
    s = client.get("/api/settings").json()
    assert s["school_name"] == "Testschule"
    assert len(s["periods"]) == 6 and s["periods"][1]["break_after"]


def test_solve_move_conflicts_and_pdf(client):
    data = setup_small(client)
    tt = client.post("/api/timetables", json={"name": "Entwurf", "time_limit": 10}).json()
    tt = wait_for(client, tt["id"])
    assert tt["status"] == "done", tt["message"]
    assert len(tt["placements"]) == 4 + 3 + 3  # M 1a (4), D 1a (2+1+1), M 1b (3)
    assert client.get(f"/api/timetables/{tt['id']}/conflicts").json() == []
    # HUB ist Mo 1.–2. gesperrt
    hub_lessons = {data["lessons"][0]["id"], data["lessons"][2]["id"]}
    for p in tt["placements"]:
        if p["lesson_id"] in hub_lessons:
            assert not (p["day"] == 0 and p["period"] < 2)
    # Raum: Stammraum für 1a, keiner für 1b
    for p in tt["placements"]:
        if p["lesson_id"] == data["lessons"][2]["id"]:
            assert p["room_id"] is None
        else:
            assert p["room_id"] == data["r"]["id"]

    # Verschieben in eine gesperrte Zeit -> 409, mit force erlaubt
    pl = next(p for p in tt["placements"] if p["lesson_id"] in hub_lessons)
    res = client.patch(f"/api/timetables/{tt['id']}/placements/{pl['id']}", json={"day": 0, "period": 0})
    assert res.status_code == 409
    assert any(c["kind"] == "unavailable" for c in res.json()["detail"]["conflicts"])
    res = client.patch(
        f"/api/timetables/{tt['id']}/placements/{pl['id']}",
        json={"day": 0, "period": 0, "force": True, "locked": True},
    )
    assert res.status_code == 200 and res.json()["locked"]
    assert client.get(f"/api/timetables/{tt['id']}/conflicts").json()

    # Neu rechnen behält den fixierten Block
    client.post(f"/api/timetables/{tt['id']}/solve", json={"time_limit": 5})
    tt2 = wait_for(client, tt["id"])
    assert tt2["status"] == "failed" or any(
        p["locked"] and p["day"] == 0 and p["period"] == 0 for p in tt2["placements"]
    )

    pdf = client.get(f"/api/timetables/{tt['id']}/pdf?view=teacher")
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")


def test_swap(client):
    setup_small(client)
    tt = wait_for(client, client.post("/api/timetables", json={"name": "A", "time_limit": 5}).json()["id"])
    a, b = tt["placements"][0], tt["placements"][1]
    res = client.post(f"/api/timetables/{tt['id']}/swap", json={"a": a["id"], "b": b["id"], "force": True})
    assert res.status_code == 200
    after = {p["id"]: p for p in res.json()}
    assert (after[a["id"]]["day"], after[a["id"]]["period"]) == (b["day"], b["period"])


def test_excel_roundtrip(client):
    setup_small(client)
    exported = client.get("/api/excel/export")
    assert exported.status_code == 200
    wb = load_workbook(io.BytesIO(exported.content))
    assert wb["Lehrkräfte"]["D2"].value in ("", None) or "Mo1-2" in str(wb["Lehrkräfte"]["D3"].value)
    res = client.post("/api/excel/import", files={"file": ("x.xlsx", exported.content)})
    assert res.status_code == 200, res.text
    assert res.json()["counts"]["Unterricht"] == 3
    teachers = {t["short"]: t for t in client.get("/api/teachers").json()}
    assert teachers["HUB"]["unavailable"] == [[0, 0], [0, 1]]


def test_excel_import_reports_errors(client):
    wb_bytes = client.get("/api/excel/template").content
    wb = load_workbook(io.BytesIO(wb_bytes))
    wb["Unterricht"].append(["9z", "XX", "NOPE", 2, 0, "", ""])
    buf = io.BytesIO()
    wb.save(buf)
    res = client.post("/api/excel/import", files={"file": ("x.xlsx", buf.getvalue())})
    assert res.status_code == 422
    errors = res.json()["detail"]["errors"]
    assert any("Fach 'XX'" in e for e in errors)
    assert client.get("/api/subjects").json() == []  # nichts geändert


def test_demo_school_solves(client):
    assert client.post("/api/demo").status_code == 204
    assert len(client.get("/api/classes").json()) == 8
    tt = wait_for(
        client, client.post("/api/timetables", json={"name": "Demo", "time_limit": 20}).json()["id"], 90
    )
    assert tt["status"] == "done", tt["message"]
    assert client.get(f"/api/timetables/{tt['id']}/conflicts").json() == []
