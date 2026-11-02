// Outils de recherche et de consultation des brevets et des dessins et modèles.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyserNoticeBrevet } from '../analyseurs/brevet.js';
import { analyserNoticeModele } from '../analyseurs/modele.js';
import { lirePageResultats } from '../analyseurs/recherche.js';
import { ParametreInvalide } from '../erreurs.js';
import { formaterFicheBrevet, formaterFicheModele, formaterResultats, lienBrevet, lienModele } from '../formats/titres.js';
import { aujourdhui, combiner, critere, critereDates, critereOu } from '../requetes.js';
import { executer, reponse, type Contexte } from './commun.js';

const SOURCE_BREVETS = "API Propriété industrielle de l'INPI (brevets)";
const SOURCE_MODELES = "API Propriété industrielle de l'INPI (dessins et modèles)";

/** Normalise un numéro de publication de brevet (FR2979292, EP3813503, WO2020123456…). */
export function normaliserNumeroBrevet(saisie: string): string {
  const n = saisie.toUpperCase().replace(/[\s.\-/]/g, '');
  const m = /^(FR|EP|WO|CCP)?(\d+)([A-Z]\d?)?$/.exec(n);
  if (!m || !m[2]) {
    throw new ParametreInvalide(`Numéro de brevet non reconnu : « ${saisie} ». Exemples attendus : FR2979292, EP3813503.`);
  }
  return `${m[1] ?? 'FR'}${m[2]}`;
}

/** Normalise un numéro de dessin ou modèle (FR20140182, WO…). */
export function normaliserNumeroModele(saisie: string): string {
  const n = saisie.toUpperCase().replace(/[\s.\-/]/g, '');
  const m = /^(FR|WO|DM)?(\d+)$/.exec(n);
  if (!m || !m[2]) {
    throw new ParametreInvalide(`Numéro de dessin ou modèle non reconnu : « ${saisie} ». Exemple attendu : FR20140182.`);
  }
  return `${m[1] === 'WO' || m[1] === 'DM' ? 'WO' : 'FR'}${m[2]}`;
}

const pagination = {
  position: z.number().int().min(0).max(500).optional().describe('Rang du premier résultat (0 par défaut).'),
  taille: z.number().int().min(1).max(100).optional().describe('Nombre de résultats (20 par défaut, 100 au plus).'),
};

export function enregistrerOutilsTitres(serveur: McpServer, ctx: Contexte): void {
  serveur.registerTool(
    'rechercher_brevets',
    {
      title: 'Rechercher des brevets',
      description:
        'Recherche des demandes de brevet et brevets français (FR), européens (EP), internationaux (WO) et des ' +
        'certificats complémentaires de protection (CCP) dans la base de l’INPI : mots-clés du titre ou de l’abrégé, ' +
        'numéro, déposant, titulaire, SIREN, inventeur, mandataire, classification CIB/CPC et dates. Les critères se cumulent.',
      inputSchema: {
        mots_cles: z.string().optional().describe('Mots du titre ou de l’abrégé (jokers * et ? acceptés).'),
        numero: z.string().optional().describe('Numéro de dépôt ou de publication (par exemple FR2928554).'),
        deposant: z.string().optional().describe('Nom du déposant.'),
        siren_deposant: z.string().regex(/^\d{9}$/).optional().describe('SIREN du déposant (pas pour les WO).'),
        titulaire: z.string().optional().describe('Nom du titulaire.'),
        siren_titulaire: z.string().regex(/^\d{9}$/).optional().describe('SIREN du titulaire (pas pour les WO).'),
        inventeur: z.string().optional().describe("Nom de l'inventeur."),
        mandataire: z.string().optional().describe('Nom du mandataire (FR uniquement).'),
        classification: z.string().optional().describe('Code CIB ou CPC : H03, H03K, H03K17 ou H03K17/687.'),
        publication_du: z.string().optional().describe('Date de publication minimale (AAAA-MM-JJ).'),
        publication_au: z.string().optional().describe('Date de publication maximale (AAAA-MM-JJ).'),
        depot_du: z.string().optional().describe('Date de dépôt minimale (AAAA-MM-JJ).'),
        depot_au: z.string().optional().describe('Date de dépôt maximale (AAAA-MM-JJ).'),
        delivrance_du: z.string().optional().describe('Date de délivrance minimale (AAAA-MM-JJ).'),
        delivrance_au: z.string().optional().describe('Date de délivrance maximale (AAAA-MM-JJ).'),
        origines: z.array(z.enum(['FR', 'EP', 'WO', 'CCP'])).optional().describe('Collections interrogées (FR et EP par défaut).'),
        requete_avancee: z
          .string()
          .optional()
          .describe('Requête au format INPI ajoutée avec ET. Champs : TIT, ABFR, DEPN, PUBN, IPCR, CPC, DENM, DESI, TINM, TISI, INVNM, AGNM, PUBD, DEPD, DLVD, PRD, RNBN.'),
        ...pagination,
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    (a) =>
      executer({ nom: SOURCE_BREVETS, lien: 'https://data.inpi.fr/recherche_avancee/brevets' }, async () => {
        const requete = combiner([
          a.mots_cles ? critere('(TIT OU ABFR)', a.mots_cles) : undefined,
          a.numero ? critere('(DEPN OU PUBN)', a.numero.replace(/\s/g, '').toUpperCase()) : undefined,
          a.deposant ? critere('(DENM OU DENMA OU DENE OU DENEA)', a.deposant) : undefined,
          a.siren_deposant ? critere('DESI', a.siren_deposant) : undefined,
          a.titulaire ? critere('TINM', a.titulaire) : undefined,
          a.siren_titulaire ? critere('TISI', a.siren_titulaire) : undefined,
          a.inventeur ? critere('(INVNM OU INVNEA)', a.inventeur) : undefined,
          a.mandataire ? critere('AGNM', a.mandataire) : undefined,
          a.classification ? critere('(IPCR OU CPC)', a.classification.replace(/\s/g, '')) : undefined,
          critereDates('PUBD', a.publication_du, a.publication_au),
          critereDates('DEPD', a.depot_du, a.depot_au),
          critereDates('DLVD', a.delivrance_du, a.delivrance_au),
          a.requete_avancee?.trim() ? `(${a.requete_avancee.trim()})` : undefined,
        ]);
        const page = lirePageResultats(
          await ctx.pi.rechercher('brevets', {
            collections: a.origines?.length ? a.origines : ['FR', 'EP'],
            query: requete,
            position: a.position ?? 0,
            size: a.taille ?? 20,
          }),
        );
        const texte = formaterResultats(page, requete, {
          quoi: 'brevet',
          titre: 'TIT',
          details: [
            ['NAT', 'nature'],
            ['PUBD', 'publié le'],
            ['DEPN', 'dépôt n°'],
            ['DEPD', 'déposé le'],
            ['DENM', 'déposant'],
            ['DENE', 'déposant'],
            ['IPRC', 'CIB'],
          ],
          outilFiche: 'fiche_brevet',
        });
        return reponse(texte, { nom: SOURCE_BREVETS, lien: 'https://data.inpi.fr/recherche_avancee/brevets' });
      }),
  );

  serveur.registerTool(
    'fiche_brevet',
    {
      title: "Fiche complète d'un brevet",
      description:
        "Fiche d'un brevet d'après la notice officielle de l'INPI : titre, abrégé, numéros et dates de dépôt, de " +
        'publication et de délivrance, déposants et titulaires avec SIREN, inventeurs, mandataire, priorités, ' +
        'classifications CIB et CPC, états désignés et événements de procédure.',
      inputSchema: {
        numero: z.string().describe('Numéro de publication, par exemple FR2979292, EP3813503 ou WO2020123456.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ numero }) =>
      executer({ nom: SOURCE_BREVETS }, async () => {
        const reference = normaliserNumeroBrevet(numero);
        const xml = await ctx.pi.xml('brevets', `brevets/notice/pubnum/${reference}`, `Le brevet ${reference}`);
        return reponse(formaterFicheBrevet(analyserNoticeBrevet(xml, reference)), {
          nom: SOURCE_BREVETS,
          lien: lienBrevet(reference),
        });
      }),
  );

  serveur.registerTool(
    'rechercher_modeles',
    {
      title: 'Rechercher des dessins et modèles',
      description:
        'Recherche des dessins et modèles français (FR) et internationaux (WO) dans la base de l’INPI : objet, ' +
        'déposant, titulaire, SIREN, mandataire, numéro, classe de Locarno, dates, modèles en vigueur.',
      inputSchema: {
        objet: z.string().optional().describe('Objet du modèle (par exemple « fauteuil* roulant* »).'),
        deposant: z.string().optional().describe('Nom du déposant.'),
        siren: z.string().regex(/^\d{9}$/).optional().describe('SIREN du déposant.'),
        titulaire: z.string().optional().describe('Nom du titulaire.'),
        mandataire: z.string().optional().describe('Nom du mandataire.'),
        numero_depot: z.string().optional().describe('Numéro de dépôt.'),
        numero_publication: z.string().optional().describe('Numéro de publication.'),
        classes: z.array(z.string().regex(/^\d{2}(\d{2})?$/)).optional().describe('Classes de Locarno (01 à 32) ou sous-classes (0101).'),
        depot_du: z.string().optional().describe('Date de dépôt minimale (AAAA-MM-JJ).'),
        depot_au: z.string().optional().describe('Date de dépôt maximale (AAAA-MM-JJ).'),
        publication_du: z.string().optional().describe('Date de publication minimale (AAAA-MM-JJ).'),
        publication_au: z.string().optional().describe('Date de publication maximale (AAAA-MM-JJ).'),
        en_vigueur: z.boolean().optional().describe("Si vrai, ne garde que les modèles dont la date d'expiration n'est pas passée."),
        origines: z.array(z.enum(['FR', 'WO'])).optional().describe('Collections interrogées (FR et WO par défaut).'),
        requete_avancee: z
          .string()
          .optional()
          .describe('Requête au format INPI ajoutée avec ET. Champs : DesignTitle, DEPOSANT, ApplicantIdentifier, DEPOTIT, MANDATAIRE, DesignApplicationNumber, ViewNumber, ClassNumber, DesignApplicationDate, PublicationDate, ExpiryDate.'),
        position: z.number().int().min(0).max(200).optional().describe('Rang du premier résultat (0 par défaut, 200 au plus).'),
        taille: pagination.taille,
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    (a) =>
      executer({ nom: SOURCE_MODELES, lien: 'https://data.inpi.fr/recherche_avancee/dessins_modeles' }, async () => {
        const requete = combiner([
          a.objet ? critere('DesignTitle', a.objet) : undefined,
          a.deposant ? critere('DEPOSANT', a.deposant) : undefined,
          a.siren ? critere('ApplicantIdentifier', a.siren) : undefined,
          a.titulaire ? critere('DEPOTIT', a.titulaire) : undefined,
          a.mandataire ? critere('MANDATAIRE', a.mandataire) : undefined,
          a.numero_depot ? critere('DesignApplicationNumber', a.numero_depot.replace(/\s/g, '')) : undefined,
          a.numero_publication ? critere('ViewNumber', a.numero_publication.replace(/\s/g, '')) : undefined,
          a.classes?.length ? critereOu('ClassNumber', a.classes) : undefined,
          critereDates('DesignApplicationDate', a.depot_du, a.depot_au),
          critereDates('PublicationDate', a.publication_du, a.publication_au),
          a.en_vigueur ? `[ExpiryDate=${aujourdhui()}:99991231]` : undefined,
          a.requete_avancee?.trim() ? `(${a.requete_avancee.trim()})` : undefined,
        ]);
        const page = lirePageResultats(
          await ctx.pi.rechercher('modeles', {
            collections: a.origines?.length ? a.origines : ['FR', 'WO'],
            query: requete,
            position: a.position ?? 0,
            size: a.taille ?? 20,
          }),
        );
        const texte = formaterResultats(page, requete, {
          quoi: 'dessin ou modèle',
          titre: 'DesignTitle',
          details: [
            ['DesignReference', 'modèle n°'],
            ['DesignApplicationNumber', 'dépôt n°'],
            ['DesignApplicationDate', 'déposé le'],
            ['PublicationDate', 'publié le'],
            ['DEPOSANT', 'déposant'],
            ['ClassNumber', 'Locarno'],
          ],
          outilFiche: 'fiche_modele',
        });
        return reponse(texte, { nom: SOURCE_MODELES, lien: 'https://data.inpi.fr/recherche_avancee/dessins_modeles' });
      }),
  );

  serveur.registerTool(
    'fiche_modele',
    {
      title: "Fiche complète d'un dessin ou modèle",
      description:
        "Fiche d'un dépôt de dessins et modèles d'après la notice officielle de l'INPI : dates, statut, modèles du " +
        'dépôt avec leur objet et leur classe de Locarno, déposants, titulaires, créateurs, mandataire, priorités, ' +
        'publications et inscriptions.',
      inputSchema: { numero: z.string().describe('Numéro de dépôt préfixé, par exemple FR20140182.') },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ numero }) =>
      executer({ nom: SOURCE_MODELES }, async () => {
        const reference = normaliserNumeroModele(numero);
        const xml = await ctx.pi.xml('modeles', `modeles/notice/${reference}`, `Le dessin ou modèle ${reference}`);
        return reponse(formaterFicheModele(analyserNoticeModele(xml, reference)), {
          nom: SOURCE_MODELES,
          lien: lienModele(reference),
        });
      }),
  );
}
