// Construction du serveur MCP et enregistrement des outils.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ClientPI } from './api/pi.js';
import { ClientRNE } from './api/rne.js';
import { Configuration } from './config.js';
import { enregistrerOutilAcces } from './outils/acces.js';
import { enregistrerOutilsMarques } from './outils/marques.js';
import { enregistrerOutilsRNE } from './outils/rne.js';
import { enregistrerOutilsTitres } from './outils/titres.js';
import type { Contexte } from './outils/commun.js';
import { VERSION } from './version.js';

export const CONSIGNES =
  "Serveur de consultation des données publiques de l'INPI (marques, brevets, dessins et modèles, " +
  'Registre national des entreprises). Outil de pure consultation : il restitue les données officielles ' +
  "sans les analyser. En cas d'erreur d'accès, appelez verifier_acces. Une erreur signalant une " +
  "indisponibilité de l'INPI ne signifie jamais qu'il n'existe aucun résultat. Les bénéficiaires " +
  "effectifs ne sont pas accessibles (accès restreint depuis l'arrêt de la CJUE du 22 novembre 2022).";

export function creerServeur(config = new Configuration()): McpServer {
  const ctx: Contexte = { config, pi: new ClientPI(config), rne: new ClientRNE(config) };
  const serveur = new McpServer(
    { name: 'mcp-open-data-inpi', title: 'Données publiques INPI (non officiel)', version: VERSION },
    { instructions: CONSIGNES },
  );
  enregistrerOutilAcces(serveur, ctx);
  enregistrerOutilsMarques(serveur, ctx);
  enregistrerOutilsTitres(serveur, ctx);
  enregistrerOutilsRNE(serveur, ctx);
  return serveur;
}
