import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import {
  EducationsController,
  ExperiencesController,
  LanguagesController,
  SkillsController,
} from "./career.controllers";
import { CareerService } from "./career.service";

@Module({
  imports: [AuthModule],
  controllers: [
    EducationsController,
    ExperiencesController,
    SkillsController,
    LanguagesController,
  ],
  providers: [CareerService],
  exports: [CareerService],
})
export class CareerModule {}
