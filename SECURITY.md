# Politique de sécurité

## Versions maintenues

Seule la dernière version publiée sur npm reçoit des correctifs de sécurité.

## Signaler une vulnérabilité

**N'ouvrez pas de ticket public** pour une vulnérabilité. Utilisez le signalement privé de GitHub :
onglet **Security** du dépôt, puis **Report a vulnerability**
(<https://github.com/neroshooter/mcp-open-data-inpi/security/advisories/new>).

Merci d'indiquer :

- la version concernée et votre environnement ;
- une description du problème et de son impact ;
- les étapes permettant de le reproduire.

Une première réponse vous sera apportée dans un délai de sept jours.

**Ne transmettez jamais vos identifiants data.inpi.fr**, ni dans un signalement, ni dans un ticket, ni dans un
journal. Si vous pensez qu'ils ont été exposés, changez immédiatement votre mot de passe sur data.inpi.fr.

## Engagements du projet

- Les identifiants sont lus dans les variables d'environnement et ne sont jamais journalisés, renvoyés dans une
  réponse ou écrits sur le disque ; les jetons de connexion restent en mémoire.
- Le journal technique masque automatiquement identifiants, jetons et cookies.
- Les seuls fichiers écrits sur le disque sont les PDF explicitement demandés, dans le dossier configuré.
- Le serveur ne communique qu'avec les domaines de l'INPI (`api-gateway.inpi.fr` et
  `registre-national-entreprises.inpi.fr`).
- L'intégration continue recherche les secrets dans le code et l'historique ; la publication npm est accompagnée
  de la provenance, qui atteste que le paquet a été construit par GitHub Actions à partir de ce dépôt.
