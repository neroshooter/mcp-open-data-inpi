# Journal des versions

Toutes les évolutions notables de ce projet sont consignées ici.

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et le projet respecte la
[numérotation sémantique](https://semver.org/lang/fr/).

## [Non publié]

## [0.1.1] - 2026-11-02

### Corrigé

- Extension Claude Desktop : les modèles `${…}` transmis sans remplacement par Claude Desktop (champ facultatif
  du mot de passe de l'API Propriété industrielle laissé vide, dossier de téléchargement `${DOWNLOADS}`) ne sont
  plus pris pour des valeurs. Ils empêchaient la connexion à l'API Propriété industrielle et le téléchargement
  des PDF.
- Un échec d'écriture du PDF sur le disque produit désormais un message clair indiquant le dossier en cause.
- La recherche d'entreprises retire les accents, que le RNE ne reconnaît pas (« français » → « francais »).
- Les natures et décisions répétées d'un même acte ne sont plus affichées en double.
- Les dirigeants sont toujours présentés sous la forme « Prénom(s) NOM », quelle que soit la casse fournie par le RNE.

### Ajouté

- `chiffres_cles_comptes` : nature des comptes (sociaux ou consolidés) indiquée clairement, choix possible par le
  paramètre `comptes`, année de l'exercice précédent toujours renseignée et liste des comptes chiffrés disponibles.

## [0.1.0] - 2026-11-02

### Ajouté

- Outil `verifier_acces` : état de chaque accès (marques, brevets, dessins et modèles, RNE) avec la marche à suivre.
- Marques : `rechercher_marques` (nom, classes de Nice, titulaire, déposant, SIREN, statut, dates, origine FR/EU/WO)
  et `fiche_marque` (notice complète, sections CDATA comprises, historique des inscriptions).
- Brevets : `rechercher_brevets` et `fiche_brevet`.
- Dessins et modèles : `rechercher_modeles` et `fiche_modele`.
- Registre national des entreprises : `rechercher_entreprises`, `fiche_entreprise`, `lister_documents_entreprise`
  (filtre des actes contenant des statuts), `telecharger_document_entreprise` et `chiffres_cles_comptes`.
- Distinction systématique entre panne de l'INPI et absence de résultat, nouvelles tentatives avec délai croissant,
  limite de débit et cache mémoire de 10 minutes.
- Extension Claude Desktop (`.mcpb`) avec formulaire de saisie des identifiants.

[Non publié]: https://github.com/neroshooter/mcp-open-data-inpi/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/neroshooter/mcp-open-data-inpi/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/neroshooter/mcp-open-data-inpi/releases/tag/v0.1.0
