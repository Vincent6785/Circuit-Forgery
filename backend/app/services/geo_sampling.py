from typing import TypeVar

T = TypeVar("T")


def subsample(items: list[T], max_items: int) -> list[T]:
    """Réduit une séquence à `max_items` éléments en préservant l'ordre et en
    gardant les deux extrémités (dès que max_items >= 2), plutôt qu'un simple
    troncage en fin de liste — donne une représentation fidèle d'un tracé
    dense (import GPX, circuit en boucle généré) sur tout son parcours, pas
    seulement son début. Partagé entre `services/gpx.py` et l'endpoint
    round-trip."""
    if len(items) <= max_items:
        return items
    step = (len(items) - 1) / (max_items - 1)
    indices = sorted({round(i * step) for i in range(max_items)})
    return [items[i] for i in indices]
