export const MACHINE_TYPES = ['original', 'vertuo'];
export const DEFAULT_MACHINE = 'original';

const MACHINE_LABELS = { original: 'Original', vertuo: 'Vertuo' };

// Falls back to the default so lean documents created before machine types existed still display.
export function machineLabel(type) {
  return MACHINE_LABELS[type] ?? MACHINE_LABELS[DEFAULT_MACHINE];
}
