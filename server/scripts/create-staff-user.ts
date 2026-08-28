/**
 * Creates a new staff account, or resets the password (and clears any
 * lockout) if the username already exists.
 *
 * Usage: npm run create-staff-user -w server -- <username> <password>
 */
import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/db/connection.js';
import { migrate } from '../src/db/migrate.js';
import { hashPassword } from '../src/domain/password.js';
import { StaffUserRepository } from '../src/repositories/staffUserRepository.js';

const [username, password] = process.argv.slice(2);
if (!username || !password) {
  console.error('Usage: npm run create-staff-user -w server -- <username> <password>');
  process.exit(1);
}
if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

const config = loadConfig();
const db = openDatabase(config.DATABASE_PATH);
migrate(db);
const staffUsers = new StaffUserRepository(db);

hashPassword(password)
  .then((hash) => {
    const existed = Boolean(staffUsers.findByUsername(username));
    staffUsers.upsert(username, hash, new Date().toISOString());
    db.close();
    console.log(existed ? `Password reset for "${username}" (and any lockout cleared).` : `Created staff account "${username}".`);
  })
  .catch((error: unknown) => {
    console.error('Failed to create/update staff user:', error);
    process.exit(1);
  });
