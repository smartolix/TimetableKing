import pytest

from app.services.excel import format_slots, parse_slots


def test_parse_and_format():
    slots = parse_slots("Mo1-2, fr 8; Di", 8)
    assert [0, 0] in slots and [0, 1] in slots and [4, 7] in slots
    assert sum(1 for d, _ in slots if d == 1) == 8
    assert format_slots(slots) == "Mo1-2, Di1-8, Fr8"


def test_parse_invalid():
    with pytest.raises(ValueError):
        parse_slots("Montag früh", 8)
