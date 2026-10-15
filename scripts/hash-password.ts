import { hashPassword } from "../src/lib/auth/passwords";

// Prints an OPERATOR_USERS entry: npm run auth:hash -- <name> <password>
const [name, password] = process.argv.slice(2);
if (!name || !password) {
  console.error("Usage: npm run auth:hash -- <name> <password>");
  process.exit(1);
}
hashPassword(password).then((hash) => console.log(`${name.toLowerCase()}:${hash}`));
