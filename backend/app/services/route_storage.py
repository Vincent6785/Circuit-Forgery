import json
from typing import Optional

from app.schemas.route import ChargingStopOut, EvSettings

"""Conversion des options d'un trajet vers et depuis les colonnes JSON de la
table routes. Partagé par le routeur des trajets (écriture et lecture) et
celui de l'export GPX (lecture seule) : sans ce module commun, chacun
redéfinissait la même désérialisation, et une divergence entre les deux
aurait produit un GPX ne décrivant pas le trajet enregistré.

Une valeur illisible (colonne écrite par une version dont le schéma
différait) rend le trajet sans cette option plutôt que de le rendre
inexploitable : ces colonnes décrivent des réglages, pas le tracé lui-même.
"""


def ev_to_json(ev: Optional[EvSettings]) -> Optional[str]:
    return json.dumps(ev.model_dump()) if ev else None


def ev_from_json(raw: Optional[str]) -> Optional[EvSettings]:
    if not raw:
        return None
    try:
        return EvSettings(**json.loads(raw))
    except (ValueError, TypeError):
        return None


def charging_stops_to_json(stops: Optional[list[ChargingStopOut]]) -> Optional[str]:
    return json.dumps([stop.model_dump() for stop in stops]) if stops else None


def charging_stops_from_json(raw: Optional[str]) -> list[ChargingStopOut]:
    if not raw:
        return []
    try:
        return [ChargingStopOut(**stop) for stop in json.loads(raw)]
    except (ValueError, TypeError):
        return []
