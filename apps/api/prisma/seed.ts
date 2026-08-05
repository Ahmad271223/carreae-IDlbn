/**
 * Seed framework — development/demo data only. All data is fully fictional
 * (brief §66); never seed real personal data. The full end-to-end seed journey
 * (§67) grows with each phase; Phase 1 seeds a student and two organizations.
 *
 * Idempotent: re-running upserts instead of duplicating.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const student = await prisma.user.upsert({
    where: { email: "student.demo@example.com" },
    update: {},
    create: {
      email: "student.demo@example.com",
      emailVerifiedAt: new Date(),
      locale: "ar",
      profile: {
        create: {
          slug: "demo-student-x7k2q",
          firstName: "Demo",
          lastName: "Student",
          headline: "Secondary school graduate — fictional demo account",
          city: "Beirut",
          countryCode: "LB",
        },
      },
      educations: {
        create: {
          institutionName: "Example Secondary School (fictional)",
          degreeType: "Lebanese Baccalaureate",
          countryCode: "LB",
          educationSystem: "lebanese-baccalaureate",
          startDate: new Date("2023-09-15"),
          endDate: new Date("2026-06-30"),
          displayOrder: 0,
        },
      },
      languages: {
        create: [
          { language: "ar", level: "NATIVE", displayOrder: 0 },
          { language: "en", level: "B2", displayOrder: 1 },
          { language: "fr", level: "B1", displayOrder: 2 },
        ],
      },
    },
  });

  const school = await prisma.organization.upsert({
    where: { id: "0198a000-0000-7000-8000-000000000001" },
    update: {},
    create: {
      id: "0198a000-0000-7000-8000-000000000001",
      type: "SCHOOL",
      name: "Example Secondary School (fictional)",
      countryCode: "LB",
      educationSystem: "lebanese-baccalaureate",
      verificationStatus: "PENDING",
    },
  });

  const languageSchool = await prisma.organization.upsert({
    where: { id: "0198a000-0000-7000-8000-000000000002" },
    update: {},
    create: {
      id: "0198a000-0000-7000-8000-000000000002",
      type: "LANGUAGE_SCHOOL",
      name: "Example Language Institute (fictional)",
      countryCode: "LB",
      verificationStatus: "PENDING",
    },
  });

  console.log(
    `Seeded: user ${student.email}, orgs [${school.name}, ${languageSchool.name}]`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
