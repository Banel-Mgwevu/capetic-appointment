/**
 * Generates a scrypt hash suitable for the ADMIN_PASSWORD_HASH environment
 * variable. Run with: npm run hash-password -w server -- <password>
 */
import { hashPassword } from '../src/domain/password.js';

const password = process.argv[2];
if (!password) {
  console.error('Usage: npm run hash-password -w server -- <password>');
  process.exit(1);
}

hashPassword(password)
  .then((hash) => {
    console.log(hash);
  })
  .catch((error: unknown) => {
    console.error('Failed to hash password:', error);
    process.exit(1);
  });
