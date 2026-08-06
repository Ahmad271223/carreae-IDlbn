import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CoverLetterController } from "./cover-letter.controller";
import { CoverLetterService } from "./cover-letter.service";

@Module({
  imports: [AuthModule],
  controllers: [CoverLetterController],
  providers: [CoverLetterService],
  exports: [CoverLetterService],
})
export class CoverLetterModule {}
