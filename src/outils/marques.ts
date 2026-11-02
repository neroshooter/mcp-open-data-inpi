// Outils rechercher_marques et fiche_marque.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyserNoticeMarque } from '../analyseurs/marque.js';
import { lirePageResultats } from '../analyseurs/recherche.js';
import { ParametreInvalide } from '../erreurs.js';
import { formaterFicheMarque, formaterResultatsMarques, lienMarque } from '../formats/marque.js';
import { aujourdhui, combiner, critere, critereDates, critereOu, valeurCritere } from '../requetes.js';
import { executer, reponse, type Contexte } from './commun.js';

const SOURCE_RECHERCHE = {
  nom: "API Propriété industrielle de l'INPI (marques)",
  lien: 'https://data.inpi.fr/recherche_avancee/marques',
};

/** Statuts observés dans la base de l'INPI (libellés exacts). */
export const STATUTS_CONNUS = {
  FR: [
    'Demande publiée',
    'Marque enregistrée',
    'Marque renouvelée',
    'Marque expirée',
    'Demande totalement rejetée',
    'Demande irrecevable après publication',
    "Marque ayant fait l'objet d'une renonciation totale",
    "Marque ayant fait l'objet d'un retrait total",
    'Marque annulée',
    'Marque déchue',
  ],
  EU_WO: [
    'Registered',
    'Application published',
    'Application opposed',
    'Application refused',
    'Application withdrawn',
    'Registration expired',
    'Registration cancelled',
    'Registration surrendered',
    'Appeal pending',
  ],
};

const TAILLE_MAX = 100;

/** Normalise un numéro de marque saisi librement en référence préfixée (FR, EU ou WO). */
export function normaliserNumeroMarque(saisie: string): string {
  const brut = saisie.toUpperCase().replace(/[\s.\-/]/g, '');
  const m = /^(FR|EU|EM|WO)?(\d+)$/.exec(brut);
  if (!m || !m[2]) {
    throw new ParametreInvalide(
      `Numéro de marque non reconnu : « ${saisie} ». Exemples attendus : FR4020655, EU019023157, WO1234567.`,
    );
  }
  const office = m[1] === 'EM' ? 'EU' : (m[1] ?? (m[2].length >= 8 ? 'EU' : 'FR'));
  const numero = office === 'EU' ? m[2].padStart(9, '0') : m[2];
  return `${office}${numero}`;
}

export function enregistrerOutilsMarques(serveur: McpServer, ctx: Contexte): void {
  serveur.registerTool(
    'rechercher_marques',
    {
      title: 'Rechercher des marques',
      description:
        "Recherche des marques françaises, de l'Union européenne et internationales dans la base de l'INPI, " +
        'par nom, classe de Nice, titulaire, déposant, SIREN, statut et dates. Les critères se cumulent. ' +
        'Renvoie une liste paginée ; utilisez ensuite fiche_marque pour le détail.',
      inputSchema: {
        nom: z
          .string()
          .optional()
          .describe(
            'Nom de la marque. Un mot seul trouve aussi les marques qui le contiennent comme mot (WORLDLINE trouve « WORLDLINE E-PAYMENT »). ' +
              'Plusieurs mots : recherche de l’expression exacte. Jokers : * (plusieurs caractères) et ? (un caractère).',
          ),
        nom_contient: z
          .string()
          .optional()
          .describe('Fragment contenu dans le nom, même au milieu d’un mot (par exemple « WORLDL »).'),
        classes: z
          .array(z.number().int().min(1).max(45))
          .optional()
          .describe('Classes de Nice (1 à 45) : la marque doit viser au moins une de ces classes.'),
        titulaire: z.string().optional().describe('Nom du titulaire (déposant ou titulaire actuel).'),
        deposant: z.string().optional().describe("Nom du déposant d'origine."),
        siren: z
          .string()
          .regex(/^\d{9}$/)
          .optional()
          .describe('SIREN du déposant (marques françaises uniquement).'),
        statut: z
          .string()
          .optional()
          .describe(
            'Libellé exact du statut. Marques FR : ' +
              STATUTS_CONNUS.FR.join(', ') +
              '. Marques EU et WO (en anglais) : ' +
              STATUTS_CONNUS.EU_WO.join(', ') +
              '.',
          ),
        en_vigueur: z
          .boolean()
          .optional()
          .describe("Si vrai, ne garde que les marques dont la date d'expiration n'est pas encore passée."),
        depot_du: z.string().optional().describe('Date de dépôt minimale (AAAA-MM-JJ).'),
        depot_au: z.string().optional().describe('Date de dépôt maximale (AAAA-MM-JJ).'),
        origines: z
          .array(z.enum(['FR', 'EU', 'WO']))
          .optional()
          .describe('Origines à interroger : FR (française), EU (Union européenne), WO (internationale). Par défaut les trois.'),
        requete_avancee: z
          .string()
          .optional()
          .describe(
            'Requête au format INPI ajoutée aux autres critères avec ET, pour les besoins avancés. ' +
              'Exemple : [Mark=WORLDLINE] SAUF [ClassNumber=9]. Champs : Mark, NGram_Mark, ClassNumber, DEPOSANT, DEPOTIT, ' +
              'ApplicantIdentifier, Representative_LastName, ApplicationNumber, ApplicationDate, ExpiryDate, MarkCurrentStatusCode.',
          ),
        position: z.number().int().min(0).max(500).optional().describe('Rang du premier résultat (0 par défaut).'),
        taille: z
          .number()
          .int()
          .min(1)
          .max(TAILLE_MAX)
          .optional()
          .describe(`Nombre de résultats par page (20 par défaut, ${TAILLE_MAX} au plus).`),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    (args) =>
      executer(SOURCE_RECHERCHE, async () => {
        const requete = combiner([
          args.nom ? critere('Mark', args.nom) : undefined,
          args.nom_contient ? critere('NGram_Mark', args.nom_contient) : undefined,
          args.classes?.length ? critereOu('ClassNumber', args.classes) : undefined,
          args.titulaire ? critere('DEPOTIT', args.titulaire) : undefined,
          args.deposant ? critere('DEPOSANT', args.deposant) : undefined,
          args.siren ? critere('ApplicantIdentifier', args.siren) : undefined,
          args.statut ? `[MarkCurrentStatusCode="${valeurCritere(args.statut).replace(/"/g, '')}"]` : undefined,
          args.en_vigueur ? `[ExpiryDate=${aujourdhui()}:99991231]` : undefined,
          critereDates('ApplicationDate', args.depot_du, args.depot_au),
          args.requete_avancee?.trim() ? `(${args.requete_avancee.trim()})` : undefined,
        ]);
        const taille = args.taille ?? 20;
        const reponseINPI = await ctx.pi.rechercher('marques', {
          collections: args.origines?.length ? args.origines : ['FR', 'EU', 'WO'],
          query: requete,
          position: args.position ?? 0,
          size: taille,
          fields: ['ApplicationNumber', 'Mark', 'MarkCurrentStatusCode', 'DEPOSANT', 'ClassNumber', 'ApplicationDate', 'ExpiryDate', 'ukey'],
        });
        const page = lirePageResultats(reponseINPI);
        return reponse(formaterResultatsMarques(page, requete, taille), SOURCE_RECHERCHE);
      }),
  );

  serveur.registerTool(
    'fiche_marque',
    {
      title: "Fiche complète d'une marque",
      description:
        "Fiche complète d'une marque d'après la notice officielle de l'INPI : nom, type, statut, dates de dépôt, " +
        "d'enregistrement et d'expiration, période de renouvellement, nombre d'oppositions, libellés intégraux des " +
        'produits et services classe par classe, titulaire actuel et déposant avec SIREN, mandataire, codes de Vienne, ' +
        'priorités, publications au BOPI et historique complet des inscriptions (cessions, changements de nom, ' +
        'renonciations partielles, libellés après limitation).',
      inputSchema: {
        numero: z
          .string()
          .describe('Numéro de la marque, de préférence préfixé : FR4020655, EU019023157 ou WO1234567. Sans préfixe, 7 chiffres = FR.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ numero }) =>
      executer({ nom: "API Propriété industrielle de l'INPI (notice de marque)" }, async () => {
        const reference = normaliserNumeroMarque(numero);
        const xml = await ctx.pi.xml('marques', `marques/notice/${reference}`, `La marque ${reference}`);
        const fiche = analyserNoticeMarque(xml);
        return reponse(formaterFicheMarque(fiche), {
          nom: "API Propriété industrielle de l'INPI (notice de marque)",
          lien: lienMarque(fiche.reference || reference),
        });
      }),
  );
}
