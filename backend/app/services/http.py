import httpx


class SharedAsyncClient:
    """Client httpx réutilisé d'une requête à l'autre : un pool de connexions
    commun évite une nouvelle connexion (et une négociation TLS vers
    Nominatim) à chaque appel. Créé à la première utilisation, fermé à l'arrêt
    de l'application (lifespan de app/main.py) et recréé si besoin après
    fermeture."""

    def __init__(self, **client_kwargs):
        self._client_kwargs = client_kwargs
        self._client: httpx.AsyncClient | None = None

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(**self._client_kwargs)
        return self._client

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None
