import { Body, Controller, Get, HttpCode, Post, UseGuards } from "@nestjs/common";
import { AccountEraseSchema, type AccountEraseDto } from "@careerid/shared";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { CurrentAuth, SessionGuard } from "../auth/session.guard";
import type { SessionContext } from "../auth/session.service";
import { AccountService } from "./account.service";

@Controller("account")
@UseGuards(SessionGuard)
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get("export")
  export(@CurrentAuth() auth: SessionContext) {
    return this.account.export(auth.user.id);
  }

  @Post("erase")
  @HttpCode(200)
  async erase(
    @CurrentAuth() auth: SessionContext,
    @Body(new ZodValidationPipe(AccountEraseSchema)) dto: AccountEraseDto,
  ) {
    await this.account.erase(auth.user.id, dto);
    return { erased: true };
  }
}
