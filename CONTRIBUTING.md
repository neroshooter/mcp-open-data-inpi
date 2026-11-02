# Guide de contribution

Merci de votre intérêt pour ce projet ! Toute contribution est bienvenue : signalement d'anomalie, amélioration de
la documentation, correction ou nouvelle fonctionnalité de consultation.

## Principes du projet

- **Consultation pure** : le serveur restitue les données publiques de l'INPI sans les analyser ni les surveiller.
- **Un seul identifiant** : le compte data.inpi.fr de l'utilisateur.
- **Français partout** : code commenté en français, messages, réponses des outils et documentation.
- **Jamais d'erreur présentée comme un résultat vide.**
- **Aucune donnée réelle non anonymisée** dans le dépôt, ni identifiant, ni fichier `.env`.

## Préparer son environnement

Prérequis : Node.js 22.12 ou plus récent.

```bash
git clone https://github.com/neroshooter/mcp-open-data-inpi.git
cd mcp-open-data-inpi
npm ci
npm run verifier   # contrôle des types, linter et tests unitaires
```

## Tests

- **Tests unitaires** (`tests/unitaires`) : ils s'appuient uniquement sur les jeux de données anonymisés de
  `tests/jeux-de-donnees` et ne font aucun appel réseau. Ils sont lancés par l'intégration continue.
- **Tests d'intégration** (`tests/integration`) : ils interrogent réellement les API de l'INPI. Ils ne s'exécutent
  qu'en local, si un fichier `.env` existe (copiez `.env.exemple`). Ce fichier est exclu du dépôt.

```bash
cp .env.exemple .env   # puis renseignez vos identifiants
npm run build
npm run test:integration
```

Ces tests consomment votre quota INPI : lancez-les avec modération.

## Ajouter un jeu de données de test

Les réponses réelles de l'INPI contiennent des données personnelles. **Ne les versionnez jamais telles quelles.**
Utilisez le script d'anonymisation, puis relisez le résultat ligne par ligne :

```bash
node scripts/anonymiser-jeux.mjs /chemin/vers/reponse-reelle.xml
```

## Proposer une modification

1. Créez une branche à partir de `main`.
2. Écrivez des tests pour tout nouvel analyseur ou toute correction.
3. Vérifiez que `npm run verifier` réussit.
4. Décrivez la modification dans `CHANGELOG.md`, rubrique « Non publié ».
5. Ouvrez une demande de fusion en expliquant le besoin.

## Publier une version (mainteneurs)

1. Mettez à jour la version dans `package.json` et `src/version.ts` (un test vérifie qu'elles concordent).
2. Déplacez les entrées « Non publié » du `CHANGELOG.md` sous le nouveau numéro.
3. Créez l'étiquette correspondante : `git tag v0.2.0 && git push origin v0.2.0`.

L'intégration continue publie alors le paquet sur npm par la publication de confiance (sans jeton stocké), avec
la provenance, et joint l'extension `.mcpb` à la version GitHub.

## Code de conduite

Restez courtois, bienveillant et constructif dans les échanges.
