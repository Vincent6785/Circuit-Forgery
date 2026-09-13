# Politique de sécurité

## Versions prises en charge

Seul l'état actuel de la branche `main` — images Docker `latest` et dernière
version `vX.Y.Z` publiées sur GitHub Container Registry — reçoit des
correctifs de sécurité.

## Modèle de menace

Circuit Forgery est conçu pour un **réseau local de confiance** : le backend
n'a pas d'authentification et quiconque atteint son port peut lire et
modifier les trajets et points d'intérêt (voir la mise en garde du
[README](README.md#images-publiées)). Un accès non authentifié au backend
depuis le réseau local n'est donc pas une vulnérabilité en soi.

Sont en revanche des vulnérabilités à signaler, par exemple :

- exécution de code ou de script (XSS via un fichier GPX, un nom de trajet,
  un résultat de recherche d'adresse…) ;
- lecture ou écriture de fichiers hors de ce que l'application expose ;
- contournement des limites de taille ou de validation permettant de
  bloquer ou de faire planter le service ;
- dépendance ou image Docker vulnérable exploitable dans ce contexte ;
- compromission de la chaîne de publication (workflows, images publiées).

## Signaler une vulnérabilité

**Ne pas ouvrir d'issue publique.** Utiliser le signalement privé de GitHub :
onglet **Security** du dépôt → **Report a vulnerability**, en décrivant le
problème, la version ou le commit concerné et, si possible, les étapes pour
le reproduire.

Le signalement reçoit une réponse dès que possible ; un correctif est
préparé en priorité selon la gravité, et le problème n'est rendu public
qu'une fois corrigé.

## Mesures en place

- Dépendances auditées à chaque PR (`pip-audit`, `npm audit`), mises à jour
  proposées par Dependabot, analyse de code CodeQL, analyse des images par
  Trivy.
- Dépendances Python figées avec leurs hashes, `npm ci` sur lockfile,
  images de base épinglées par digest, jar GraphHopper vérifié par SHA-256,
  actions GitHub épinglées par SHA de commit.
- Conteneurs exécutés sans privilèges root ; images publiées avec
  attestation de provenance et SBOM.
