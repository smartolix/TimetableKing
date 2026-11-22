"""Schülergruppen-„Atome“: kleinste Schülergruppen einer Klasse.

Hat eine Klasse die Teilungen Religion (RK, EV) und Gruppen (G1, G2), gibt es vier Atome:
RK+G1, RK+G2, EV+G1, EV+G2. Ein Unterricht für „RK“ belegt die Atome RK+G1 und RK+G2,
ein Unterricht für die ganze Klasse alle vier. Zwei Unterrichte kollidieren, wenn sie ein gemeinsames Atom belegen.
"""

from dataclasses import dataclass, field
from itertools import product

from app import models

MAX_ATOMS_PER_CLASS = 64


@dataclass
class AtomIndex:
    # atom_id -> (class_id, frozenset(group_ids))
    atoms: dict[int, tuple[int, frozenset[int]]] = field(default_factory=dict)
    class_atoms: dict[int, list[int]] = field(default_factory=dict)
    labels: dict[int, str] = field(default_factory=dict)

    def for_class(self, class_id: int) -> list[int]:
        return self.class_atoms.get(class_id, [])

    def for_group(self, group: models.Group) -> list[int]:
        cid = group.division.class_id
        return [a for a in self.for_class(cid) if group.id in self.atoms[a][1]]

    def for_part(self, part: models.LessonPart) -> list[int]:
        out: set[int] = set()
        for c in part.classes:
            out.update(self.for_class(c.id))
        for g in part.groups:
            out.update(self.for_group(g))
        return sorted(out)


def build_atoms(classes: list[models.SchoolClass]) -> AtomIndex:
    idx = AtomIndex()
    next_id = 1
    for c in sorted(classes, key=lambda x: x.id):
        divisions = [d for d in c.divisions if d.groups]
        combos = list(product(*[[g for g in d.groups] for d in divisions]))[:MAX_ATOMS_PER_CLASS] or [()]
        idx.class_atoms[c.id] = []
        for combo in combos:
            idx.atoms[next_id] = (c.id, frozenset(g.id for g in combo))
            idx.labels[next_id] = c.name + ("" if not combo else " (" + "+".join(g.name for g in combo) + ")")
            idx.class_atoms[c.id].append(next_id)
            next_id += 1
    return idx
