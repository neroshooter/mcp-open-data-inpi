// Outils du Registre national des entreprises : recherche, fiche, documents,
// téléchargement des PDF et chiffres clés des comptes.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { lireChiffresCles } from '../analyseurs/comptes.js';
import { analyserDocuments } from '../analyseurs/documents.js';
import { analyserEntreprise } from '../analyseurs/entreprise.js';
import { ErreurINPI, Introuvable, ParametreInvalide } from '../erreurs.js';
import {
  formaterChiffresCles,
  formaterDocuments,
  formaterFicheEntreprise,
  formaterListeEntreprises,
  lienEntreprise,
} from '../formats/entreprise.js';
import { executer, reponse, type Contexte } from './commun.js';

const NOM_SOURCE = "API Registre national des entreprises (RNE) de l'INPI";

const schemaSiren = z
  .string()
  .describe('Numéro SIREN à 9 chiffres (les espaces sont acceptés).');

/** Valide et normalise un SIREN (9 chiffres). */
export function normaliserSiren(saisie: string): string {
  const s = saisie.replace(/[\s.]/g, '');
  if (!/^\d{9}$/.test(s)) throw new ParametreInvalide(`SIREN invalide : « ${saisie} ». Un SIREN comporte 9 chiffres.`);
  return s;
}

/** Les identifiants de documents du RNE sont des chaînes hexadécimales. */
function normaliserIdentifiant(saisie: string): string {
  const id = saisie.trim();
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) throw new ParametreInvalide(`Identifiant de document invalide : « ${saisie} ».`);
  return id;
}

async function attachments(ctx: Contexte, siren: string) {
  const { donnees } = await ctx.rne.json<unknown>(`/api/companies/${siren}/attachments`, `Les documents de l'entreprise ${siren}`);
  return donnees;
}

export function enregistrerOutilsRNE(serveur: McpServer, ctx: Contexte): void {
  serveur.registerTool(
    'rechercher_entreprises',
    {
      title: 'Rechercher une entreprise au RNE',
      description:
        'Recherche des entreprises dans le Registre national des entreprises par dénomination (recherche « contient »), ' +
        'éventuellement filtrée par code postal. Renvoie le SIREN, la forme juridique et le siège.',
      inputSchema: {
        denomination: z.string().min(2).describe('Dénomination ou partie de la dénomination.'),
        code_postal: z.string().regex(/^\d{5}$/).optional().describe('Code postal du siège (5 chiffres).'),
        page: z.number().int().min(1).max(50).optional().describe('Numéro de page (1 par défaut).'),
        taille: z.number().int().min(1).max(20).optional().describe('Résultats par page (10 par défaut, 20 au plus).'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    (args) =>
      executer({ nom: NOM_SOURCE, lien: 'https://data.inpi.fr' }, async () => {
        const page = args.page ?? 1;
        const taille = args.taille ?? 10;
        // Le RNE ne trouve pas les dénominations saisies avec des accents (« français ») : on les retire.
        const denomination = args.denomination.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const params = new URLSearchParams({ companyName: denomination, page: String(page), pageSize: String(taille) });
        if (args.code_postal) params.append('zipCodes[]', args.code_postal);
        const { donnees, entetes } = await ctx.rne.json<unknown[]>(`/api/companies?${params}`, 'La recherche');
        const fiches = (Array.isArray(donnees) ? donnees : []).map(analyserEntreprise);
        const total = entetes['pagination-count'] !== undefined ? Number(entetes['pagination-count']) : undefined;
        return reponse(formaterListeEntreprises(fiches, total, page, taille, args.denomination), {
          nom: NOM_SOURCE,
          lien: 'https://data.inpi.fr',
        });
      }),
  );

  serveur.registerTool(
    'fiche_entreprise',
    {
      title: "Fiche d'une entreprise (RNE)",
      description:
        "Fiche d'une entreprise d'après le Registre national des entreprises : dénomination, forme juridique, capital " +
        "social, objet social, durée, date de clôture de l'exercice, siège, dates d'immatriculation, dirigeants et " +
        'commissaires aux comptes. Les bénéficiaires effectifs ne sont pas accessibles (accès restreint).',
      inputSchema: { siren: schemaSiren },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ siren }) =>
      executer({ nom: NOM_SOURCE }, async () => {
        const s = normaliserSiren(siren);
        const { donnees } = await ctx.rne.json<unknown>(`/api/companies/${s}`, `L'entreprise ${s}`);
        return reponse(formaterFicheEntreprise(analyserEntreprise(donnees)), { nom: NOM_SOURCE, lien: lienEntreprise(s) });
      }),
  );

  serveur.registerTool(
    'lister_documents_entreprise',
    {
      title: 'Actes et comptes déposés',
      description:
        "Liste les actes et les comptes annuels déposés au RNE pour une entreprise, avec leur identifiant de téléchargement. " +
        'Le filtre statuts_seulement ne garde que les actes contenant des statuts.',
      inputSchema: {
        siren: schemaSiren,
        statuts_seulement: z.boolean().optional().describe('Ne lister que les actes contenant des statuts.'),
        type: z.enum(['tous', 'actes', 'comptes']).optional().describe('Documents à lister (tous par défaut).'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    (args) =>
      executer({ nom: NOM_SOURCE }, async () => {
        const s = normaliserSiren(args.siren);
        const docs = analyserDocuments(await attachments(ctx, s));
        const statutsSeulement = args.statuts_seulement ?? false;
        const type = args.type ?? (statutsSeulement ? 'actes' : 'tous');
        return reponse(formaterDocuments(s, docs, { statutsSeulement, type }), { nom: NOM_SOURCE, lien: lienEntreprise(s) });
      }),
  );

  serveur.registerTool(
    'telecharger_document_entreprise',
    {
      title: 'Télécharger un acte ou des comptes (PDF)',
      description:
        "Télécharge en PDF un acte ou des comptes annuels déposés au RNE et l'enregistre dans le dossier de " +
        'téléchargement configuré (variable INPI_DOSSIER_TELECHARGEMENTS). Renvoie le chemin du fichier.',
      inputSchema: {
        type: z.enum(['acte', 'comptes']).describe('acte ou comptes'),
        identifiant: z.string().describe('Identifiant du document, tel que donné par lister_documents_entreprise.'),
        siren: schemaSiren.optional().describe('SIREN de l’entreprise (facultatif, sert à nommer le fichier).'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    (args) =>
      executer({ nom: NOM_SOURCE }, async () => {
        const id = normaliserIdentifiant(args.identifiant);
        const siren = args.siren ? normaliserSiren(args.siren) : undefined;
        const chemin = args.type === 'acte' ? `/api/actes/${id}/download` : `/api/bilans/${id}/download`;
        const { contenu } = await ctx.rne.binaire(chemin, args.type === 'acte' ? "L'acte demandé" : 'Les comptes demandés');
        if (contenu.subarray(0, 5).toString('latin1') !== '%PDF-') {
          throw new ErreurINPI(
            "Le RNE n'a pas renvoyé de fichier PDF pour ce document. Vérifiez l'identifiant et le type (acte ou comptes).",
          );
        }
        const dossier = ctx.config.dossierTelechargements;
        const nom = `${[siren, args.type === 'acte' ? 'acte' : 'comptes', id].filter(Boolean).join('_')}.pdf`;
        const fichier = join(dossier, nom);
        try {
          await mkdir(dossier, { recursive: true });
          await writeFile(fichier, contenu);
        } catch (e) {
          const code = (e as NodeJS.ErrnoException).code ?? 'erreur inconnue';
          throw new ErreurINPI(
            `Le document a bien été obtenu auprès de l'INPI, mais il n'a pas pu être enregistré dans le dossier ` +
              `« ${dossier} » (${code}). Vérifiez le dossier de téléchargement indiqué dans la configuration.`,
          );
        }
        const taille = (contenu.length / 1024).toFixed(0);
        return reponse(
          `# Document enregistré\n\n- **Fichier** : ${fichier}\n- **Taille** : ${taille} Ko\n- **Type** : ${args.type === 'acte' ? 'acte' : 'comptes annuels'}`,
          { nom: NOM_SOURCE, ...(siren ? { lien: lienEntreprise(siren) } : {}) },
        );
      }),
  );

  serveur.registerTool(
    'chiffres_cles_comptes',
    {
      title: 'Chiffres clés des comptes annuels',
      description:
        "Chiffres clés des comptes annuels saisis par l'INPI (chiffre d'affaires, résultat d'exploitation, résultat net, " +
        "capital, capitaux propres, total des dettes, total du bilan, effectif), pour l'exercice et l'exercice précédent. " +
        'Comptes complets, simplifiés et consolidés.',
      inputSchema: {
        siren: schemaSiren,
        exercice: z
          .number()
          .int()
          .min(1990)
          .max(2100)
          .optional()
          .describe("Année de clôture de l'exercice (par défaut, le plus récent disponible)."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    (args) =>
      executer({ nom: NOM_SOURCE }, async () => {
        const s = normaliserSiren(args.siren);
        const donnees = (await attachments(ctx, s)) as { bilansSaisis?: Array<Record<string, unknown>> };
        const saisis = (donnees.bilansSaisis ?? [])
          .filter((b) => b.deleted !== true)
          .sort((a, b) => String(b.dateCloture ?? '').localeCompare(String(a.dateCloture ?? '')));
        const choisi = args.exercice
          ? saisis.find((b) => String(b.dateCloture ?? '').startsWith(String(args.exercice)))
          : saisis[0];
        if (!choisi) {
          const disponibles = saisis.map((b) => String(b.dateCloture ?? '').slice(0, 4)).filter(Boolean);
          throw new Introuvable(
            args.exercice
              ? `Aucun compte saisi pour l'exercice ${args.exercice}. Exercices disponibles : ${disponibles.join(', ') || 'aucun'}.`
              : "L'INPI n'a saisi aucun compte annuel chiffré pour cette entreprise (comptes non déposés, confidentiels ou non saisis). " +
                  'Consultez la liste des documents pour télécharger les PDF éventuels.',
          );
        }
        // La liste des documents contient en principe les données saisies ; sinon, on les demande.
        const complet = choisi.bilanSaisi
          ? choisi
          : (await ctx.rne.json<Record<string, unknown>>(`/api/bilans-saisis/${normaliserIdentifiant(String(choisi.id))}`, 'Les comptes saisis')).donnees;
        return reponse(formaterChiffresCles(s, lireChiffresCles(complet)), { nom: NOM_SOURCE, lien: lienEntreprise(s) });
      }),
  );
}
