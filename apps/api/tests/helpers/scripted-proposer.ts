import type {
  BlueprintProposer,
  ProposalAttempt,
  RepairRequest,
} from '../../src/application/ports/blueprint-proposer.js';
import type { AnalysisInput } from '../../src/domain/blueprint/analysis-input.js';
import type { ProposedBlueprint } from '../../src/domain/blueprint/types.js';

export interface ScriptedProposer extends BlueprintProposer {
  proposeCalls: number;
  repairCalls: number;
  lastRepairProblems: string[];
  lastInput: AnalysisInput | null;
}

export interface ScriptedProposerOptions {
  /** Lo que devuelve el primer intento. Si es `Error`, se lanza. */
  first: ProposedBlueprint | Error;
  /** Lo que devuelve la reparacion. Si falta, repite el primero. */
  second?: ProposedBlueprint | Error;
}

/**
 * Motor de inferencia guionizado.
 *
 * La existencia del puerto `BlueprintProposer` permite que toda la suite corra
 * sin clave de API, sin red y sin gastar dinero, ejercitando de verdad el
 * validador, la reparacion y el camino de RE-04: los tres caminos que importan.
 */
export function createScriptedProposer(options: ScriptedProposerOptions): ScriptedProposer {
  const proposer: ScriptedProposer = {
    proposeCalls: 0,
    repairCalls: 0,
    lastRepairProblems: [],
    lastInput: null,

    propose(input: AnalysisInput): Promise<ProposalAttempt> {
      proposer.proposeCalls += 1;
      proposer.lastInput = input;

      if (options.first instanceof Error) return Promise.reject(options.first);
      return Promise.resolve({ blueprint: structuredClone(options.first) });
    },

    repair(request: RepairRequest): Promise<ProposalAttempt> {
      proposer.repairCalls += 1;
      proposer.lastRepairProblems = [...request.problems];

      const answer = options.second ?? options.first;
      if (answer instanceof Error) return Promise.reject(answer);
      return Promise.resolve({ blueprint: structuredClone(answer) });
    },
  };

  return proposer;
}

/** La propuesta correcta para el archivo de demo de dos hojas. */
export function viajesBlueprint(): ProposedBlueprint {
  return {
    applicationName: 'Gestion de Viajes',
    entities: [
      {
        name: 'clientes',
        label: 'Clientes',
        origin: 'sheet',
        sourceSheetIndex: 1,
        displayField: 'nombre',
        dedupeField: 'ruc',
        fields: [
          {
            name: 'nombre',
            label: 'Cliente',
            type: 'text',
            required: true,
            source: { sheetIndex: 1, columnIndex: 0 },
          },
          {
            name: 'ruc',
            label: 'RUC',
            type: 'text',
            required: false,
            source: { sheetIndex: 1, columnIndex: 1 },
          },
          {
            name: 'correo',
            label: 'Correo',
            type: 'email',
            required: false,
            source: { sheetIndex: 1, columnIndex: 2 },
          },
          {
            name: 'telefono',
            label: 'Telefono',
            type: 'phone',
            required: false,
            source: { sheetIndex: 1, columnIndex: 3 },
          },
          {
            name: 'ciudad',
            label: 'Ciudad',
            type: 'text',
            required: false,
            source: { sheetIndex: 1, columnIndex: 4 },
          },
        ],
      },
      {
        name: 'viajes',
        label: 'Viajes',
        origin: 'sheet',
        sourceSheetIndex: 0,
        displayField: 'vehiculo',
        fields: [
          {
            name: 'fecha',
            label: 'Fecha',
            type: 'date',
            required: true,
            source: { sheetIndex: 0, columnIndex: 0 },
          },
          {
            name: 'cliente',
            label: 'Cliente',
            type: 'relation',
            required: true,
            targetEntity: 'clientes',
            source: { sheetIndex: 0, columnIndex: 1 },
          },
          {
            name: 'vehiculo',
            label: 'Vehiculo',
            type: 'text',
            required: false,
            source: { sheetIndex: 0, columnIndex: 3 },
          },
          {
            name: 'conductor',
            label: 'Conductor',
            type: 'text',
            required: false,
            source: { sheetIndex: 0, columnIndex: 4 },
          },
          {
            name: 'valor',
            label: 'Valor',
            type: 'decimal',
            required: false,
            source: { sheetIndex: 0, columnIndex: 5 },
          },
          {
            name: 'estado',
            label: 'Estado',
            type: 'select',
            required: false,
            options: ['Abierto', 'Cerrado'],
            source: { sheetIndex: 0, columnIndex: 6 },
          },
        ],
      },
    ],
    relations: [
      { fromEntity: 'viajes', toEntity: 'clientes', fieldName: 'cliente', type: 'many_to_one' },
    ],
  };
}
