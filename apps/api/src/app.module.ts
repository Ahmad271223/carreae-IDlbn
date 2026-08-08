import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { HealthModule } from "./modules/health/health.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CareerModule } from "./modules/career/career.module";
import { ProfileModule } from "./modules/profile/profile.module";
import { VerificationModule } from "./modules/verification/verification.module";
import { DocumentsModule } from "./modules/documents/documents.module";
import { CredentialsModule } from "./modules/credentials/credentials.module";
import { CvModule } from "./modules/cv/cv.module";
import { CoverLetterModule } from "./modules/cover-letter/cover-letter.module";
import { RenderModule } from "./modules/render/render.module";
import { AiModule } from "./modules/ai/ai.module";
import { ApplicationModule } from "./modules/application/application.module";
import { ShareModule } from "./modules/share/share.module";
import { OrganizationsModule } from "./modules/organizations/organizations.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { PrismaModule } from "./prisma/prisma.module";
import { AccountModule } from "./modules/account/account.module";
import { SubmissionsModule } from "./modules/submissions/submissions.module";

/**
 * Modular monolith root. Every domain from docs/ARCHITECTURE.md gets its own
 * module under src/modules/<domain>; modules talk via public module APIs or
 * domain events — never via another module's repositories (boundary rule T4).
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      // Async so limits are read at app init (tests tune them per instance).
      useFactory: () => ({
        throttlers: [
          {
            name: "default",
            ttl: 60_000,
            limit: Number(process.env.THROTTLE_DEFAULT_LIMIT ?? 100),
          },
        ],
      }),
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    ProfileModule,
    CareerModule,
    VerificationModule,
    DocumentsModule,
    CredentialsModule,
    CvModule,
    CoverLetterModule,
    RenderModule,
    AiModule,
    ApplicationModule,
    ShareModule,
    OrganizationsModule,
    NotificationsModule,
    AccountModule,
    SubmissionsModule,
  ],
})
export class AppModule {}
