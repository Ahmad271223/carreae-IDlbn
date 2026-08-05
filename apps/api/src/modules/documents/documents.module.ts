import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { StorageModule } from "../storage/storage.module";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";
import { SCANNER, buildScanner } from "./scanner";

@Module({
  imports: [AuditModule, AuthModule, StorageModule],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    { provide: SCANNER, useFactory: buildScanner },
  ],
  exports: [DocumentsService],
})
export class DocumentsModule {}
