# mcp-open-data-inpi

[![npm](https://img.shields.io/npm/v/mcp-open-data-inpi)](https://www.npmjs.com/package/mcp-open-data-inpi)
[![Intégration continue](https://github.com/neroshooter/mcp-open-data-inpi/actions/workflows/ci.yml/badge.svg)](https://github.com/neroshooter/mcp-open-data-inpi/actions/workflows/ci.yml)
[![Licence MIT](https://img.shields.io/badge/licence-MIT-blue)](LICENSE)

Serveur MCP **open source et non officiel** qui permet à Claude (ou à tout autre assistant compatible MCP) de
**consulter les données publiques de l'INPI** avec un seul identifiant : l'adresse et le mot de passe de votre
compte [data.inpi.fr](https://data.inpi.fr).

> ⚠️ **Projet indépendant.** Ce projet n'est ni affilié à l'Institut national de la propriété industrielle (INPI)
> ni approuvé par lui. Les informations sont restituées telles que l'INPI les diffuse ; **seuls les documents
> officiels font foi**. Chaque réponse du serveur rappelle sa source et donne un lien vers data.inpi.fr.

## Ce que vous pouvez faire

| Domaine | Ce que le serveur restitue |
|---|---|
| **Marques** françaises, de l'Union européenne et internationales | Recherche par nom, classe de Nice, titulaire, déposant, SIREN, statut et dates. Fiche complète : type, statut, dates de dépôt, d'enregistrement et d'expiration, période de renouvellement, nombre d'oppositions, libellés intégraux des produits et services classe par classe, titulaire actuel et déposant avec leur SIREN, mandataire, codes de Vienne, priorités, publications au BOPI, historique complet des inscriptions (cessions, changements de nom, renonciations partielles, libellés après limitation). |
| **Brevets** (FR, EP, WO, CCP) | Recherche par mots-clés, numéro, déposant, titulaire, SIREN, inventeur, mandataire, CIB/CPC et dates. Fiche : titre, abrégé, nature et statut, numéros et dates, titulaires, déposants avec SIREN, inventeurs, mandataire, priorités, classifications CIB et CPC, annuités payées et à venir, délivrance, rejet ou déchéance, inscriptions au Registre national des brevets, documents cités. |
| **Dessins et modèles** (FR, WO) | Recherche par objet, déposant, titulaire, SIREN, mandataire, numéro, classe de Locarno et dates. Fiche : dépôt, pays désignés, objet, statut, expiration, classe de Locarno, reproductions, créateurs, déposants, mandataires, historique des inscriptions (publications, renouvellements, cessions, changements de titulaire). |
| **Registre national des entreprises (RNE)** | Recherche par dénomination. Fiche : dénomination, forme juridique, capital social, objet social, durée, date de clôture, siège, dates d'immatriculation, dirigeants, commissaires aux comptes. Liste des actes (avec un filtre « statuts seulement ») et des comptes annuels, téléchargement des PDF, chiffres clés des comptes sur l'exercice et l'exercice précédent. |

Le serveur est un outil de **pure consultation** : il n'analyse pas les données, ne surveille rien et ne modifie
rien. Les **bénéficiaires effectifs** ne sont pas restitués : leur accès est restreint depuis l'arrêt de la Cour de
justice de l'Union européenne du 22 novembre 2022 (affaires C-37/20 et C-601/20).

Les décisions du directeur général de l'INPI sur les oppositions et la jurisprudence en propriété industrielle ne
sont pas encore couvertes : l'INPI ne les diffuse aujourd'hui que par un serveur FTP soumis à un identifiant
distinct, et a annoncé leur intégration prochaine à data.inpi.fr.

---

## Mise en route pas à pas

Comptez une quinzaine de minutes. Aucune compétence en programmation n'est nécessaire.

### Étape 1 — Créer votre compte data.inpi.fr

1. Rendez-vous sur [data.inpi.fr](https://data.inpi.fr) et cliquez sur **Se connecter**, puis sur **Créer un compte**.
2. Renseignez votre adresse électronique et choisissez un mot de passe.
3. Validez votre compte en cliquant sur le lien reçu par courriel.

Si vous avez déjà un compte INPI (par exemple pour les dépôts en ligne ou le guichet unique), essayez d'abord de
vous connecter avec celui-ci.

### Étape 2 — Activer les accès aux API

L'accès aux données par programme doit être activé une fois pour toutes, famille par famille :

1. Connectez-vous sur [data.inpi.fr](https://data.inpi.fr).
2. Ouvrez votre **espace personnel**, rubrique **« Mes accès API / SFTP »**.
3. Cochez les accès souhaités et validez :
   - **Marques**, **Brevets** et **Dessins & Modèles** (API Propriété industrielle) ;
   - **API RNE** (Registre national des entreprises).
4. L'INPI peut vous envoyer un courriel de confirmation. Pour l'API Propriété industrielle, ce courriel peut vous
   inviter à définir un mot de passe sur `api-gateway.inpi.fr`. Si vous choisissez un mot de passe différent de
   celui de data.inpi.fr, notez-le : vous le renseignerez dans le champ facultatif prévu à cet effet.

L'activation peut demander quelques minutes. L'outil `verifier_acces` (étape 4) vous dira quels accès fonctionnent.

### Étape 3 — Installer le serveur

Choisissez **une** des méthodes suivantes.

#### Méthode A — Extension Claude Desktop (la plus simple)

1. Téléchargez le fichier `mcp-open-data-inpi-x.y.z.mcpb` de la
   [dernière version publiée](https://github.com/neroshooter/mcp-open-data-inpi/releases/latest).
2. Double-cliquez dessus : Claude Desktop propose de l'installer.
   (Sinon : Claude Desktop › Réglages › Extensions › Paramètres avancés › **Installer une extension…**)
3. Renseignez le formulaire : adresse et mot de passe data.inpi.fr, et éventuellement le dossier où enregistrer
   les PDF. Le mot de passe est conservé dans le trousseau de votre système.

Claude Desktop fournit lui-même l'environnement d'exécution : rien d'autre à installer.

#### Méthode B — Claude Desktop, par le fichier de configuration

Cette méthode nécessite [Node.js](https://nodejs.org/fr) (version 22 ou plus récente, « LTS » recommandée).

1. Dans Claude Desktop, ouvrez **Réglages › Développeur › Modifier la configuration**. Le fichier
   `claude_desktop_config.json` s'ouvre (macOS : `~/Library/Application Support/Claude/`, Windows :
   `%APPDATA%\Claude\`).
2. Ajoutez le bloc suivant dans `"mcpServers"` (créez cette rubrique si elle n'existe pas), en remplaçant
   l'adresse et le mot de passe :

```json
{
  "mcpServers": {
    "inpi": {
      "command": "npx",
      "args": ["-y", "mcp-open-data-inpi"],
      "env": {
        "INPI_EMAIL": "votre.adresse@exemple.fr",
        "INPI_MOT_DE_PASSE": "votre mot de passe data.inpi.fr"
      }
    }
  }
}
```

3. Enregistrez, puis **quittez complètement** Claude Desktop et relancez-le.

Avec cette méthode, le mot de passe figure en clair dans votre fichier de configuration : protégez l'accès à
votre ordinateur, ou préférez la méthode A.

#### Méthode C — Claude Code

```bash
claude mcp add --env INPI_EMAIL=votre.adresse@exemple.fr --env "INPI_MOT_DE_PASSE=votre mot de passe" --transport stdio inpi -- npx -y mcp-open-data-inpi
```

#### Autres clients MCP (Cursor, Windsurf, etc.)

Déclarez un serveur « stdio » qui lance `npx -y mcp-open-data-inpi`, avec les variables d'environnement
`INPI_EMAIL` et `INPI_MOT_DE_PASSE`.

### Étape 4 — Vérifier que tout fonctionne

Dans une nouvelle conversation, demandez simplement :

> Vérifie mes accès INPI.

Claude appelle l'outil `verifier_acces` et affiche, pour chaque famille de données, ✅ si l'accès fonctionne ou ❌
avec la marche à suivre. Essayez ensuite, par exemple :

> Donne-moi la fiche complète de la marque française n° 4020655.
>
> Quelles marques WORLDLINE en vigueur visent les classes 9 ou 36 ?
>
> Qui sont les dirigeants et les commissaires aux comptes de la société dont le SIREN est 403 052 111 ?
>
> Liste les actes contenant des statuts de cette société et télécharge les plus récents.
>
> Quels sont le chiffre d'affaires et le résultat net de ses derniers comptes ?

---

## Outils disponibles

| Outil | Rôle |
|---|---|
| `verifier_acces` | Indique quels accès fonctionnent avec votre compte et lesquels activer. |
| `rechercher_marques` | Recherche de marques (nom, classes, titulaire, déposant, SIREN, statut, dates, origine). |
| `fiche_marque` | Fiche complète d'une marque (FR, EU ou WO). |
| `rechercher_brevets` | Recherche de brevets (FR, EP, WO, CCP). |
| `fiche_brevet` | Fiche complète d'un brevet. |
| `rechercher_modeles` | Recherche de dessins et modèles (FR, WO). |
| `fiche_modele` | Fiche complète d'un dépôt de dessins et modèles. |
| `rechercher_entreprises` | Recherche d'entreprises au RNE par dénomination. |
| `fiche_entreprise` | Fiche d'une entreprise (RNE). |
| `lister_documents_entreprise` | Actes et comptes annuels déposés ; filtre « statuts seulement ». |
| `telecharger_document_entreprise` | Enregistre le PDF d'un acte ou de comptes dans votre dossier de téléchargement. |
| `chiffres_cles_comptes` | Chiffre d'affaires, résultats, capital, capitaux propres, dettes, total du bilan, effectif. |

## Réglages (variables d'environnement)

| Variable | Obligatoire | Rôle |
|---|---|---|
| `INPI_EMAIL` | oui | Adresse de votre compte data.inpi.fr. |
| `INPI_MOT_DE_PASSE` | oui | Mot de passe de votre compte data.inpi.fr. |
| `INPI_PI_MOT_DE_PASSE` | non | Mot de passe propre à l'API Propriété industrielle, s'il diffère du précédent. |
| `INPI_DOSSIER_TELECHARGEMENTS` | non | Dossier des PDF téléchargés (par défaut : `Téléchargements/mcp-open-data-inpi`). |
| `INPI_JOURNAL` | non | Niveau du journal technique : `silencieux`, `erreur` (par défaut), `info` ou `debug`. |

## Fonctionnement et limites

- **Erreur n'est pas absence.** Lorsque l'INPI est indisponible (erreurs 405, 500, 502, 503…), le serveur réessaie
  plusieurs fois avec un délai croissant, puis l'indique clairement. Il ne présente jamais une panne comme une
  absence de résultat.
- **Quotas.** L'INPI limite le nombre d'appels (pour l'API RNE : 10 000 appels ou 10 000 Mo par jour ; pour l'API
  Propriété industrielle, la limite n'est pas publiée). Le serveur espace ses requêtes et garde les réponses
  **10 minutes en mémoire** pour éviter les appels répétés. Rien n'est conservé sur le disque, à l'exception des
  PDF que vous demandez explicitement.
- **Chiffres clés.** Ils proviennent des comptes saisis par l'INPI à partir de la liasse fiscale. Pour les comptes
  simplifiés, le chiffre d'affaires est la somme des postes 210, 214 et 218 du formulaire 2033-B ; cette
  correspondance, tirée de la documentation de l'INPI, est signalée comme à rapprocher du PDF. Les comptes
  déclarés confidentiels ne livrent aucun chiffre ; les comptes de banques et d'assurances ne sont pas lus
  automatiquement (le PDF reste disponible).
- **Dessins et modèles internationaux.** Lorsqu'un dépôt contient plusieurs modèles, l'API de l'INPI ne restitue
  que la notice du premier ; la fiche le signale et renvoie vers data.inpi.fr pour les suivants.
- **Réutilisation des données.** Certaines entreprises s'opposent à la diffusion de leurs données ou à leur
  utilisation commerciale ; le serveur le signale. Respectez les conditions de réutilisation de l'INPI.

## Confidentialité et sécurité

- Vos identifiants ne sont transmis qu'à l'INPI. Ils ne sont **jamais journalisés, jamais renvoyés dans une réponse
  et jamais écrits sur le disque** par le serveur ; les jetons de connexion restent en mémoire.
- Le journal technique (sortie d'erreur) masque automatiquement les identifiants, jetons et cookies.
- Voir la [politique de sécurité](SECURITY.md) pour signaler une vulnérabilité.

## Dépannage

| Symptôme | Que faire |
|---|---|
| « Identifiants absents » | Les variables `INPI_EMAIL` et `INPI_MOT_DE_PASSE` ne sont pas renseignées : vérifiez la configuration, puis redémarrez Claude. |
| « L'API … refuse l'adresse ou le mot de passe » | Vérifiez vos identifiants sur data.inpi.fr. Pour l'API Propriété industrielle, essayez `INPI_PI_MOT_DE_PASSE` si vous avez défini un mot de passe distinct. |
| « Accès refusé par l'INPI : l'accès … n'est pas activé » | Activez l'accès indiqué dans votre espace personnel (étape 2). |
| « … momentanément indisponible » | Panne côté INPI : réessayez plus tard. |
| « … refuse temporairement les requêtes (code 429) » | Limite de débit ou quota atteint : patientez. |
| Le serveur n'apparaît pas dans Claude Desktop | Quittez complètement Claude Desktop puis relancez-le ; pour la méthode B, vérifiez que Node.js 22 ou plus récent est installé (`node --version`). Les journaux se trouvent dans `~/Library/Logs/Claude/` (macOS). |

## Contribuer

Les contributions sont bienvenues : voir le [guide de contribution](CONTRIBUTING.md). Le journal des versions est
dans [CHANGELOG.md](CHANGELOG.md).

## Licence

Code publié sous [licence MIT](LICENSE) © 2026 Noam Fitoussi.

Les données restituées appartiennent à leurs producteurs et sont diffusées par l'INPI selon ses propres conditions
de réutilisation ; la licence MIT ne s'applique qu'au code de ce projet.
