import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
import { StorageModule } from "../storage/storage.module";
import { AccountController } from "./account.controller";
import { AccountService } from "./account.service";

@Module({
  imports: [AuthModule, AuditModule, StorageModule],
  controllers: [AccountController],
  providers: [AccountService],
})
export class AccountModule {}
