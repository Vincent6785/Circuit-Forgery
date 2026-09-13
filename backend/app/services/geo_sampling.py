from typing import TypeVar

T = TypeVar("T")


def subsample_indices(count: int, max_items: int) -> list[int]:
    """Indices, dans l'ordre, des éléments à conserver pour réduire une
    séquence de `count` éléments à `max_items`, en gardant les deux extrémités
    (dès que max_items >= 2). Exposé séparément de subsample() pour les
    appelants qui ont besoin de savoir d'où vient chaque élément conservé —
    l'endpoint round-trip en déduit les bornes de legs du tracé."""
    if count <= max_items:
        return list(range(count))
    if max_items < 2:
        return list(range(max(max_items, 0)))
    step = (count - 1) / (max_items - 1)
    return sorted({round(i * step) for i in range(max_items)})


def subsample(items: list[T], max_items: int) -> list[T]:
    """Réduit une séquence à `max_items` éléments en préservant l'ordre et en
    gardant les deux extrémités (dès que max_items >= 2), plutôt qu'un simple
    troncage en fin de liste — donne une représentation fidèle d'un tracé
    dense (import GPX, circuit en boucle généré) sur tout son parcours, pas
    seulement son début. Partagé entre `services/gpx.py` et l'endpoint
    round-trip."""
    if len(items) <= max_items:
        return items
    return [items[i] for i in subsample_indices(len(items), max_items)]
