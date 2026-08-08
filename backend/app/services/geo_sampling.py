from typing import TypeVar

T = TypeVar("T")


def subsample(items: list[T], max_items: int) -> list[T]:
    """Sous-échantillonne une séquence en préservant l'ordre (les extrémités
    sont incluses dès que max_items >= 2) plutôt qu'un simple troncage —
    utile pour représenter fidèlement un tracé dense (import GPX, circuit en
    boucle généré) avec un nombre borné de points. Partagé entre
    `services/gpx.py` et l'endpoint round-trip."""
    if len(items) <= max_items:
        return items
    step = (len(items) - 1) / (max_items - 1)
    indices = sorted({round(i * step) for i in range(max_items)})
    return [items[i] for i in indices]
