import { body } from 'express-validator';
import { MAX_INTENSITY, MAX_SCORE, MIN_INTENSITY, MIN_SCORE } from '../models/Pod.js';
import { machineTypeRule } from './machine.js';

export const podRules = [
  machineTypeRule,
  body('brand')
    .default('')
    .isString()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Brand must be 100 characters or fewer'),
  body('name')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Enter the pod name')
    .isLength({ max: 100 })
    .withMessage('Name must be 100 characters or fewer'),
  body('intensity')
    .isInt({ min: MIN_INTENSITY, max: MAX_INTENSITY })
    .withMessage(`Intensity must be a whole number from ${MIN_INTENSITY} to ${MAX_INTENSITY}`)
    .toInt(),
  body('score')
    .isFloat({ min: MIN_SCORE, max: MAX_SCORE })
    .withMessage(`Score must be a number from ${MIN_SCORE} to ${MAX_SCORE}`)
    .toFloat(),
  body('flavour')
    .default('')
    .isString()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Flavour must be 200 characters or fewer'),
  body('notes')
    .default('')
    .isString()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Notes must be 2000 characters or fewer'),
  body('dateTried')
    .optional({ values: 'falsy' })
    .isISO8601({ strict: true })
    .withMessage('Enter a valid date')
    .toDate(),
];
