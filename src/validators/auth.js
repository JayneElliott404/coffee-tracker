import { body } from 'express-validator';
import { machineTypeRule } from './machine.js';

// bcrypt only uses the first 72 bytes of a password.
const passwordRule = (field) =>
  body(field)
    .isString()
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .custom((value) => Buffer.byteLength(value, 'utf8') <= 72)
    .withMessage('Password is too long');

export const usernameRule = body('username')
  .isString()
  .trim()
  .toLowerCase()
  .isLength({ max: 254 })
  .withMessage('Email address must be 254 characters or fewer')
  .bail()
  .isEmail()
  .withMessage('Enter a valid email address');

export const registerRules = [
  body('name')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Enter your name')
    .bail()
    .isLength({ max: 50 })
    .withMessage('Name must be 50 characters or fewer'),
  usernameRule,
  passwordRule('password'),
  body('confirmPassword')
    .custom((value, { req }) => value === req.body.password)
    .withMessage('Passwords do not match'),
  machineTypeRule,
];

export const loginRules = [
  body('username').isString().trim().toLowerCase().notEmpty().withMessage('Enter your email address'),
  body('password').isString().notEmpty().withMessage('Enter your password'),
];

export const changePasswordRules = [
  body('currentPassword').isString().notEmpty().withMessage('Enter your current password'),
  passwordRule('newPassword').custom((value, { req }) => value !== req.body.currentPassword)
    .withMessage('New password must be different from your current password'),
  body('confirmPassword')
    .custom((value, { req }) => value === req.body.newPassword)
    .withMessage('Passwords do not match'),
];
