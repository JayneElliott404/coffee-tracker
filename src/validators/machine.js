import { body } from 'express-validator';
import { MACHINE_TYPES } from '../utils/machine.js';

// Optional so clients that omit it keep the existing value (or the account default for new records).
export const machineTypeRule = body('machineType')
  .optional({ values: 'falsy' })
  .isIn(MACHINE_TYPES)
  .withMessage('Choose Original or Vertuo');

export const machineSettingsRules = [
  body('machineType').isIn(MACHINE_TYPES).withMessage('Choose Original or Vertuo'),
];
