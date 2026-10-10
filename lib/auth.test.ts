import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePassword, passwordStrength, humanAuthError } from './password';

test('validatePassword: rejects empty and short passwords', () => {
  assert.equal(validatePassword(''), 'Choose a password');
  assert.equal(validatePassword('short'), 'Use at least 8 characters');
  assert.equal(validatePassword('1234567'), 'Use at least 8 characters');
});

test('validatePassword: rejects passwords over 72 characters', () => {
  const longPw = 'a'.repeat(73);
  assert.equal(validatePassword(longPw), 'Keep it under 72 characters');
});

test('validatePassword: rejects leading/trailing spaces', () => {
  assert.equal(validatePassword('  validlengthpassword'), 'Remove the spaces at the start or end');
  assert.equal(validatePassword('validlengthpassword  '), 'Remove the spaces at the start or end');
});

test('validatePassword: rejects repeated characters and predictable keyboard patterns', () => {
  assert.equal(validatePassword('aaaaaaaa'), 'That’s the same character repeated — try something else');
  assert.equal(validatePassword('1234567890'), 'That’s a keyboard pattern — try something less predictable');
  assert.equal(validatePassword('qwertyuiop'), 'That’s a keyboard pattern — try something less predictable');
});

test('validatePassword: rejects common passwords', () => {
  assert.equal(validatePassword('password123'), 'That password is too common — pick something else');
  assert.equal(validatePassword('wecycle123'), 'That password is too common — pick something else');
  assert.equal(validatePassword('manipal123'), 'That password is too common — pick something else');
});

test('validatePassword: rejects passwords containing user email or name', () => {
  assert.equal(
    validatePassword('mira1988pass', { email: 'mira@learner.manipal.edu' }),
    'Don’t use your email address in the password'
  );
  assert.equal(
    validatePassword('2026mirasharma', { name: 'Mira Sharma' }),
    'Don’t use your name in the password'
  );
  /* But does not falsely reject substrings that just happen to appear inside unrelated words */
  assert.equal(
    validatePassword('tamarindchutney2026', { name: 'Amar' }),
    null
  );
});

test('validatePassword: accepts strong unique passwords', () => {
  assert.equal(validatePassword('correct-horse-battery-staple'), null);
  assert.equal(validatePassword('CampusCycle@2026!Safe'), null);
});

test('passwordStrength: correctly calculates strength score and labels', () => {
  assert.deepEqual(passwordStrength(''), { score: 0, label: '' });
  assert.deepEqual(passwordStrength('abcdefg'), { score: 0, label: 'Too short' });
  assert.deepEqual(passwordStrength('abcdefgh'), { score: 1, label: 'Okay' });
  assert.deepEqual(passwordStrength('abcdefghijkl'), { score: 2, label: 'Good' });
  assert.deepEqual(passwordStrength('SuperSecret2026!'), { score: 3, label: 'Strong' });
});

test('humanAuthError: handles Supabase and Appwrite invalid credentials', () => {
  // Supabase
  assert.equal(
    humanAuthError('Invalid login credentials', 'signin'),
    'That email and password don’t match. If you joined before passwords existed, use “Forgot password? Set a new one” below.'
  );
  // Appwrite
  assert.equal(
    humanAuthError('Invalid credentials. Please check the email and password.', 'signin'),
    'That email and password don’t match. If you joined before passwords existed, use “Forgot password? Set a new one” below.'
  );
  assert.equal(
    humanAuthError('user_invalid_credentials', 'signin'),
    'That email and password don’t match. If you joined before passwords existed, use “Forgot password? Set a new one” below.'
  );
  assert.equal(
    humanAuthError('Invalid credentials', 'signup'),
    'Those details didn’t match — please try again.'
  );
});

test('humanAuthError: handles Supabase and Appwrite user already exists', () => {
  // Supabase
  assert.equal(
    humanAuthError('User already registered', 'signup'),
    'That email already has an account — sign in instead, or reset the password.'
  );
  // Appwrite
  assert.equal(
    humanAuthError('A user with the same id, email, or phone already exists in this project.', 'signup'),
    'That email already has an account — sign in instead, or reset the password.'
  );
  assert.equal(
    humanAuthError('user_already_exists', 'signup'),
    'That email already has an account — sign in instead, or reset the password.'
  );
});

test('humanAuthError: handles password length errors from both backends', () => {
  // Supabase
  assert.equal(
    humanAuthError('Password should be at least 6 characters.', 'signup'),
    'Use at least 8 characters.'
  );
  // Appwrite
  assert.equal(
    humanAuthError('Invalid password param: Password must be between 8 and 256 characters long.', 'signup'),
    'Use at least 8 characters.'
  );
});

test('humanAuthError: handles OTP and token expiration / invalidity', () => {
  assert.equal(
    humanAuthError('Token has expired or is invalid', 'reset'),
    'That code didn’t match, or it has expired. Retype the latest code — or request a fresh one.'
  );
  assert.equal(
    humanAuthError('Invalid token provided', 'reset'),
    'That code didn’t match, or it has expired. Retype the latest code — or request a fresh one.'
  );
});

test('humanAuthError: handles rate limiting and network errors', () => {
  assert.equal(
    humanAuthError('For security purposes, you can only request this after 30 seconds', 'reset'),
    'We’ve sent too many emails just now — wait a minute and try again.'
  );
  assert.equal(
    humanAuthError('Rate limit exceeded', 'reset'),
    'We’ve sent too many emails just now — wait a minute and try again.'
  );
  /* Appwrite rate-limits sign-in too — that is not about emails. */
  assert.equal(
    humanAuthError('Rate limit for the current endpoint has been exceeded. Please try again after some time.', 'signin'),
    'Too many tries just now — wait a minute and try again.'
  );
  assert.equal(
    humanAuthError('Failed to fetch', 'signin'),
    'Can’t reach the server — check your connection and try again.'
  );
});
