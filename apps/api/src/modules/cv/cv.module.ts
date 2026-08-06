import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CvController } from "./cv.controller";
import { CvService } from "./cv.service";

@Module({
  imports: [AuthModule],
  controllers: [CvController],
  providers: [CvService],
  exports: [CvService],
})
export class CvModule {}
