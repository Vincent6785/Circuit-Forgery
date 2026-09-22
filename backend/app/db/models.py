from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Route(Base):
    __tablename__ = "routes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    waypoints_json: Mapped[str] = mapped_column(Text, nullable=False)
    profile: Mapped[str] = mapped_column(String, nullable=False, default="moto_no_fast")
    distance_m: Mapped[float] = mapped_column(Float, nullable=False)
    duration_s: Mapped[float] = mapped_column(Float, nullable=False)
    geometry_geojson: Mapped[str] = mapped_column(Text, nullable=False)
    is_favorite: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)
    # Nullable — renseignée par toute modification du trajet (PUT), sauf un
    # simple changement de favori.
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)
    # Nullable — absent aussi bien pour les trajets créés avant l'existence
    # des zones à éviter que pour ceux qui n'en ont simplement aucune.
    avoid_zones_json: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    # Nullable — None signifie le seuil par défaut du profil (80 km/h), pas
    # une valeur manquante à distinguer d'un trajet plus ancien.
    speed_limit_kmh: Mapped[float | None] = mapped_column(Float, nullable=True, default=None)
    no_speed_limit: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Nullable — None signifie "véhicule thermique" (aucun arrêt recharge),
    # aussi bien pour un trajet enregistré avant l'existence du mode
    # électrique que pour un trajet qui ne l'utilise pas.
    ev_json: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)


class PointOfInterest(Base):
    __tablename__ = "points_of_interest"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    category: Mapped[str | None] = mapped_column(String, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)


class ChargingStation(Base):
    """Borne de recharge issue de la Base nationale des IRVE (data.gouv.fr),
    mise en cache au fil des trajets calculés — une ligne par *station*, alors
    que la source en publie une par point de charge.

    Ce cache n'est pas une copie du jeu de données : seules les zones
    traversées par un trajet électrique y entrent, cellule par cellule (voir
    IrveCacheCell)."""

    __tablename__ = "charging_stations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # id_station_itinerance quand il existe, sinon un identifiant dérivé des
    # coordonnées : la source laisse ce champ à "Non concerné" pour les
    # stations hors itinérance.
    station_id: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    address: Mapped[str | None] = mapped_column(String, nullable=True)
    # Puissance nominale la plus élevée parmi les points de charge de la
    # station ; None quand la source ne la renseigne pour aucun d'eux.
    power_kw: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Nombre de points de charge connus pour cette station.
    point_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    # Champ station_deux_roues de la source : informatif, jamais filtrant (il
    # vaut False pour l'écrasante majorité des stations, y compris utilisables
    # à moto).
    two_wheeler: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)


# La sélection d'une borne filtre sur un cadre lat/lon : sans cet index, elle
# parcourait toute la table à chaque arrêt de recharge planifié.
Index("ix_charging_stations_lat_lon", ChargingStation.lat, ChargingStation.lon)


class IrveCacheCell(Base):
    """Cellule de la grille de cache IRVE déjà interrogée auprès de data.gouv.

    Sans elle, une zone réellement dépourvue de borne serait réinterrogée à
    chaque recalcul : c'est l'absence d'entrée, pas l'absence de station, qui
    déclenche un appel réseau."""

    __tablename__ = "irve_cache_cells"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # "<index latitude>:<index longitude>" dans la grille de pas
    # settings.irve_cache_cell_deg.
    cell_key: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)
    # True quand l'API avait plus de lignes que le budget de pages autorisé :
    # la cellule est utilisable mais incomplète, et l'information mérite
    # d'être visible en base pour diagnostiquer un mauvais choix de borne.
    truncated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
