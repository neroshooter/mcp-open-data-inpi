// Limiteur de débit : impose un intervalle minimal entre deux requêtes
// adressées au même service, pour rester très en deçà des quotas de l'INPI.

export class Limiteur {
  #prochainCreneau = 0;

  constructor(private readonly intervalleMs: number) {}

  /** Attend que le prochain créneau soit libre, puis le réserve. */
  async attendre(): Promise<void> {
    const maintenant = Date.now();
    const creneau = Math.max(maintenant, this.#prochainCreneau);
    this.#prochainCreneau = creneau + this.intervalleMs;
    const delai = creneau - maintenant;
    if (delai > 0) await pause(delai);
  }
}

export function pause(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
