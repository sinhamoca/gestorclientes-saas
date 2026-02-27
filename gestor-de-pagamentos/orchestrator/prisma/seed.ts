import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...\n');

  // Criar Super Admin
  const existingSuperAdmin = await prisma.account.findFirst({
    where: { role: 'SUPER_ADMIN' },
  });

  if (existingSuperAdmin) {
    console.log('⚡ Super Admin já existe:', existingSuperAdmin.email);
  } else {
    const superAdmin = await prisma.account.create({
      data: {
        name: 'Isaac',
        email: 'admin@orchestrator.com',
        password: await bcrypt.hash('admin123', 10),
        role: 'SUPER_ADMIN',
        mustChangePassword: false, // super admin não precisa trocar
        isActive: true,
      },
    });

    console.log('✅ Super Admin criado:');
    console.log(`   Email: ${superAdmin.email}`);
    console.log(`   Senha: admin123`);
    console.log(`   Role:  SUPER_ADMIN`);
  }

  console.log('\n🌱 Seed complete!\n');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
