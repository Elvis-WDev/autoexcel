import type { AnalysisInput } from '../../domain/blueprint/analysis-input.js';
import type { ProposedBlueprint } from '../../domain/blueprint/types.js';

export interface ProposalAttempt {
  blueprint: ProposedBlueprint;
  /** Para observabilidad y control de coste. */
  usage?: { inputTokens: number; outputTokens: number; cachedInputTokens: number };
}

export interface RepairRequest {
  input: AnalysisInput;
  previous: ProposedBlueprint;
  /** Lo que el validador rechazo, en sus propias palabras. */
  problems: string[];
}

/**
 * Puerto del motor de inferencia.
 *
 * La IA vive detras de esta interfaz y en ningun otro sitio. Dos consecuencias
 * que no son cosmeticas:
 *
 *   - P-03 y P-04 quedan garantizados por arquitectura. Fuera de este puerto no
 *     hay forma de invocar un modelo, asi que la creacion de la estructura y la
 *     importacion no pueden depender de el aunque alguien lo intentara.
 *   - La suite de tests corre entera sin clave de API y sin gastar dinero,
 *     usando una implementacion determinista.
 */
export interface BlueprintProposer {
  propose(input: AnalysisInput): Promise<ProposalAttempt>;
  /** Segundo intento, con los problemas del validador como entrada. */
  repair(request: RepairRequest): Promise<ProposalAttempt>;
}
