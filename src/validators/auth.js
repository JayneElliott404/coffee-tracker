import { body } from 'express-validator';

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
  .isLength({ min: 3, max: 30 })
  .withMessage('Username must be 3–30 characters')
  .bail()
  .matches(/^[a-z0-9_.-]+$/)
  .withMessage('Username can only contain letters, numbers, dots, dashes and underscores');

export const registerRules = [
  usernameRule,
  passwordRule('password'),
  body('confirmPassword')
    .custom((value, { req }) => value === req.body.password)
    .withMessage('Passwords do not match'),
];

export const loginRules = [
  body('username').isString().trim().toLowerCase().notEmpty().withMessage('Enter your username'),
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
