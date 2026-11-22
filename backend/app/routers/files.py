"""Import/Export: Excel-Stammdaten, PDF-Pläne, Beispielschule."""

from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app import schemas
from app.db import get_session
from app.routers.timetables import get_timetable
from app.services import demo, excel, pdf

router = APIRouter(prefix="/api", tags=["Import/Export"])
SessionDep = Annotated[Session, Depends(get_session)]
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
MAX_UPLOAD = 10 * 1024 * 1024


def _download(content: bytes, media_type: str, filename: str) -> Response:
    return Response(
        content,
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )


@router.get("/excel/template")
def excel_template():
    return _download(excel.export_workbook(None), XLSX, "TimetableKing-Vorlage.xlsx")


@router.get("/excel/export")
def excel_export(session: SessionDep):
    return _download(excel.export_workbook(session), XLSX, "TimetableKing-Stammdaten.xlsx")


@router.post("/excel/import", response_model=schemas.ImportResult)
async def excel_import(file: UploadFile, session: SessionDep):
    content = await file.read(MAX_UPLOAD + 1)
    if len(content) > MAX_UPLOAD:
        raise HTTPException(413, "Datei ist größer als 10 MB")
    try:
        counts = excel.import_workbook(session, content)
    except excel.ImportError_ as exc:
        session.rollback()
        raise HTTPException(
            422, {"message": "Import abgebrochen, es wurde nichts geändert.", "errors": exc.errors}
        ) from exc
    return schemas.ImportResult(counts=counts)


@router.post("/demo", status_code=204)
def load_demo(session: SessionDep):
    """Ersetzt alle Daten durch die Beispielschule."""
    demo.load_demo(session)
    return Response(status_code=204)


@router.get("/timetables/{timetable_id}/pdf")
def timetable_pdf(
    timetable_id: int,
    session: SessionDep,
    view: Annotated[str, Query(pattern="^(class|teacher|room)$")] = "class",
    entity_id: int | None = None,
):
    tt = get_timetable(session, timetable_id)
    try:
        content = pdf.render_pdf(session, tt, view, entity_id)
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    names = {"class": "Klassen", "teacher": "Lehrkraefte", "room": "Raeume"}
    return _download(content, "application/pdf", f"{tt.name} - {names[view]}.pdf")
