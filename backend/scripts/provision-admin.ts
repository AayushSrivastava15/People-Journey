import { userService } from '../src/services/user.service';
import { closePool } from '../src/config/database';

async function main() {
  const args = process.argv.slice(2);
  const email = args[0]?.trim();
  const fullName = args[1]?.trim() || 'HR Administrator';
  const role = (args[2]?.trim() as 'hr_admin' | 'hr_staff') || 'hr_admin';

  if (!email) {
    console.error('Usage: npm run provision:admin -- <email> [fullName] [role]');
    console.error('Example: npm run provision:admin -- aayushsrivastav241@gmail.com "Aayush Srivastava" hr_admin');
    process.exit(1);
  }

  console.log(`Provisioning HR User: ${email} (${fullName}) with role: ${role}...`);

  try {
    const existing = await userService.findByEmail(email);
    if (existing) {
      console.log(`User ${email} already exists (ID: ${existing.hrUserId}, Role: ${existing.role}, Active: ${existing.isActive}).`);
      if (!existing.isActive || existing.role !== role) {
        console.log(`Updating user to role=${role}, isActive=true...`);
        const updated = await userService.update(existing.hrUserId, { role, isActive: true });
        console.log('User updated successfully:', updated);
      }
    } else {
      const created = await userService.create({
        email,
        fullName,
        role,
      });
      console.log('Successfully provisioned new HR user in Oracle:');
      console.log(JSON.stringify(created, null, 2));
    }
  } catch (err) {
    console.error('Error provisioning HR user:', err);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
