import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { AiContextBuilder } from "./ai-context";
import { AiController, LetterGeneratorController } from "./ai.controller";
import { AI_PROVIDER, buildAIProvider } from "./ai-provider";
import { AiService } from "./ai.service";

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [AiController, LetterGeneratorController],
  providers: [
    AiService,
    AiContextBuilder,
    { provide: AI_PROVIDER, useFactory: buildAIProvider },
  ],
  exports: [AiService],
})
export class AiModule {}
