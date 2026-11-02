// Journal du serveur.
//
// Un serveur MCP en stdio réserve la sortie standard au protocole : tout
// message de diagnostic part donc sur la sortie d'erreur. Chaque message est
// filtré pour masquer les identifiants et les jetons avant d'être écrit.

type Niveau = 'silencieux' | 'erreur' | 'info' | 'debug';
const ORDRE: Record<Niveau, number> = { silencieux: 0, erreur: 1, info: 2, debug: 3 };

const secrets = new Set<string>();

/** Déclare une valeur à masquer dans tous les messages du journal. */
export function enregistrerSecret(valeur: string): void {
  if (valeur.length >= 4) secrets.add(valeur);
}

/** Masque les secrets connus, les jetons et les champs sensibles d'un texte. */
export function masquer(texte: string): string {
  let resultat = texte;
  for (const s of secrets) resultat = resultat.split(s).join('***');
  return resultat
    .replace(/(Bearer\s+)[\w.~+/=-]+/gi, '$1***')
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '***')
    .replace(
      /("?(?:password|motDePasse|token|access_token|refresh_token|accessToken|refreshToken)"?\s*[:=]\s*)"?[^",;\s}]+"?/gi,
      '$1***',
    )
    .replace(/((?:XSRF-TOKEN|access_token|refresh_token|session_token)=)[^;\s]+/gi, '$1***');
}

function niveauCourant(): Niveau {
  const n = process.env.INPI_JOURNAL as Niveau | undefined;
  return n && n in ORDRE ? n : 'erreur';
}

function ecrire(niveau: Exclude<Niveau, 'silencieux'>, message: string): void {
  if (ORDRE[niveauCourant()] < ORDRE[niveau]) return;
  process.stderr.write(`[mcp-open-data-inpi] ${niveau} ${masquer(message)}\n`);
}

export const journal = {
  erreur: (m: string) => ecrire('erreur', m),
  info: (m: string) => ecrire('info', m),
  debug: (m: string) => ecrire('debug', m),
};
