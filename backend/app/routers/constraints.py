"""Bedingungen: Katalog, Anlegen, Bearbeiten, Reihenfolge."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import models, schemas
from app.constraint_catalog import CATEGORIES, IMPORTANCE_LABEL, catalog_json, validate_params
from app.db import get_session
from app.services.problem import get_settings, known_ids, load_periods

router = APIRouter(prefix="/api/constraints", tags=["Bedingungen"])
SessionDep = Annotated[Session, Depends(get_session)]


@router.get("/catalog")
def catalog():
    return {"categories": CATEGORIES, "importance": IMPORTANCE_LABEL, "types": catalog_json()}


def _validated(session: Session, data: schemas.ConstraintIn) -> dict:
    n_days = get_settings(session).days
    n_periods = max(1, len(load_periods(session)))
    try:
        return validate_params(data.type, data.params, n_days, n_periods, known_ids(session))
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.get("", response_model=list[schemas.ConstraintOut])
def list_constraints(session: SessionDep):
    return session.scalars(
        select(models.Constraint).order_by(models.Constraint.position, models.Constraint.id)
    ).all()


@router.post("", response_model=schemas.ConstraintOut, status_code=201)
def create_constraint(data: schemas.ConstraintIn, session: SessionDep):
    params = _validated(session, data)
    position = (session.scalar(select(func.max(models.Constraint.position))) or 0) + 1
    c = models.Constraint(**data.model_dump(exclude={"params"}), params=params, position=position)
    session.add(c)
    session.commit()
    return c


@router.put("/{constraint_id}", response_model=schemas.ConstraintOut)
def update_constraint(constraint_id: int, data: schemas.ConstraintIn, session: SessionDep):
    c = session.get(models.Constraint, constraint_id)
    if c is None:
        raise HTTPException(404, "Bedingung nicht gefunden")
    params = _validated(session, data)
    for k, v in data.model_dump(exclude={"params"}).items():
        setattr(c, k, v)
    c.params = params
    session.commit()
    return c


class ActiveIn(BaseModel):
    active: bool


@router.patch("/{constraint_id}/active", response_model=schemas.ConstraintOut)
def set_active(constraint_id: int, data: ActiveIn, session: SessionDep):
    c = session.get(models.Constraint, constraint_id)
    if c is None:
        raise HTTPException(404, "Bedingung nicht gefunden")
    c.active = data.active
    session.commit()
    return c


@router.delete("/{constraint_id}", status_code=204)
def delete_constraint(constraint_id: int, session: SessionDep):
    c = session.get(models.Constraint, constraint_id)
    if c is None:
        raise HTTPException(404, "Bedingung nicht gefunden")
    session.delete(c)
    session.commit()
    return Response(status_code=204)
