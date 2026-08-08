# Licence des données

Ce projet utilise des données routières issues d'**OpenStreetMap**, distribuées sous licence
[ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) via l'extrait régional
[Geofabrik](https://download.geofabrik.de/europe/france.html) `europe/france-latest.osm.pbf`.

## Attribution

Toute vue cartographique de l'application doit afficher la mention :

> © OpenStreetMap contributors

## Usage

Cet outil est déployé exclusivement en local et sur réseau local (LAN), sans redistribution
publique des données ni du graphe de routage dérivé. Dans ce cadre, la clause de partage à
l'identique (share-alike) de l'ODbL ne s'applique pas. Si ce projet évoluait vers une
redistribution publique (hébergement partagé, publication du graphe compilé, etc.), les
obligations de l'ODbL concernant les bases de données dérivées devront être réévaluées.

## Traçabilité de l'extrait utilisé

L'extrait OSM est téléchargé via `scripts/download-osm-data.sh`. Le nom et la date de
téléchargement du fichier `.pbf` en cours d'utilisation font foi ; consulter la date de
modification de `data/osm/france-latest.osm.pbf` pour connaître la fraîcheur des données.
