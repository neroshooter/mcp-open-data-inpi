// Outil verifier_acces : indique quels accès fonctionnent avec le compte
// configuré, et lesquels activer dans l'espace personnel data.inpi.fr.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FamillePI } from '../api/pi.js';
import { AccesNonActive, ErreurINPI, IdentifiantsManquants, LIBELLES_ACCES, type Acces } from '../erreurs.js';
import { executer, reponse, type Contexte } from './commun.js';

/** Requête minimale servant à tester chaque famille de l'API PI. */
const SONDES: Record<FamillePI, { collections: string[]; query: string }> = {
  marques: { collections: ['FR'], query: '[ApplicationNumber=4020655]' },
  brevets: { collections: ['FR'], query: '[TIT=boulangerie]' },
  modeles: { collections: ['FR'], query: '[DesignTitle=chaise]' },
};

interface Etat {
  acces: Acces;
  ok: boolean;
  detail: string;
}

export function enregistrerOutilAcces(serveur: McpServer, ctx: Contexte): void {
  serveur.registerTool(
    'verifier_acces',
    {
      title: 'Vérifier les accès INPI',
      description:
        "Vérifie, avec le compte data.inpi.fr configuré, quels accès fonctionnent : marques, brevets, " +
        "dessins et modèles (API Propriété industrielle) et Registre national des entreprises (API RNE). " +
        "À utiliser en premier en cas de doute ou d'erreur d'accès.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    () =>
      executer({ nom: 'INPI', lien: 'https://data.inpi.fr/espace_personnel/acces' }, async () => {
        if (!ctx.config.identifiantsPresents) throw new IdentifiantsManquants();
        const etats: Etat[] = [];

        for (const famille of ['marques', 'brevets', 'modeles'] as const) {
          etats.push(await tester(famille, () => ctx.pi.rechercher(famille, { ...SONDES[famille], size: 1 })));
        }
        etats.push(
          await tester('rne', () => ctx.rne.json('/api/companies?siren[]=403052111&pageSize=1', "L'entreprise test")),
        );

        const actifs = etats.filter((e) => e.ok).length;
        const texte = [
          `# Accès INPI : ${actifs} sur ${etats.length} fonctionnent`,
          '',
          ...etats.map((e) => `- ${e.ok ? '✅' : '❌'} **${LIBELLES_ACCES[e.acces]}** : ${e.detail}`),
          '',
          actifs === etats.length
            ? 'Tous les accès sont opérationnels.'
            : "Pour activer un accès manquant : connectez-vous sur data.inpi.fr, ouvrez votre espace personnel, " +
              "rubrique « Mes accès API / SFTP », cochez l'accès concerné et validez. L'activation peut prendre " +
              'quelques minutes.',
          '',
          '## Configuration reçue (aucune valeur affichée)',
          '',
          `- Mot de passe utilisé pour l'API Propriété industrielle : ${
            ctx.config.motDePassePIPropre ? 'mot de passe propre (INPI_PI_MOT_DE_PASSE)' : 'mot de passe principal (INPI_MOT_DE_PASSE)'
          }`,
          `- Dossier de téléchargement : ${ctx.config.dossierTelechargements}`,
          ctx.config.modelesIgnores.length
            ? `- Valeurs reçues sous forme de modèle « \${…} » non remplacé, donc ignorées : ${ctx.config.modelesIgnores.join(', ')}`
            : '- Aucune valeur reçue sous forme de modèle non remplacé.',
        ].join('\n');
        return reponse(texte, { nom: 'INPI', lien: 'https://data.inpi.fr/espace_personnel/acces' });
      }),
  );
}

async function tester(acces: Acces, appel: () => Promise<unknown>): Promise<Etat> {
  try {
    await appel();
    return { acces, ok: true, detail: 'opérationnel' };
  } catch (e) {
    if (e instanceof AccesNonActive) return { acces, ok: false, detail: 'accès non activé pour ce compte' };
    if (e instanceof ErreurINPI) return { acces, ok: false, detail: e.message };
    return { acces, ok: false, detail: 'erreur inattendue' };
  }
}
