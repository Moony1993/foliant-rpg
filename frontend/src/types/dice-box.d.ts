declare module '@3d-dice/dice-box' {
  interface DiceBoxConfig {
    assetPath: string;
    container?: string | HTMLElement;
    id?: string;
    scale?: number;
    gravity?: number;
    mass?: number;
    friction?: number;
    restitution?: number;
    spinForce?: number;
    throwForce?: number;
    startingHeight?: number;
    settleTimeout?: number;
    offscreen?: boolean;
    enableShadows?: boolean;
    shadowTransparency?: number;
    lightIntensity?: number;
    theme?: string;
    themeColor?: string;
    delay?: number;
    angularDamping?: number;
    linearDamping?: number;
    onRollComplete?: (results: RollResult[]) => void;
    onDieComplete?: (result: RollResult) => void;
    onBeforeRoll?: (notation: unknown) => void;
    onRemoveComplete?: (result: RollResult) => void;
  }

  interface DieRoll {
    sides: number;
    groupId: number;
    rollId: number;
    theme?: string;
    value: number;
  }

  interface RollResult {
    id: number;
    sides: number;
    theme?: string;
    value: number;
    rolls: DieRoll[];
  }

  export default class DiceBox {
    constructor(config: DiceBoxConfig);
    init(): Promise<void>;
    roll(notation: string | object): Promise<RollResult[]>;
    add(notation: string | object): Promise<RollResult[]>;
    clear(): void;
    remove(notation: object): void;
    updateConfig(config: Partial<DiceBoxConfig>): void;
    onRollComplete: ((results: RollResult[]) => void) | undefined;
    onDieComplete: ((result: RollResult) => void) | undefined;
  }
}
