import {
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CurrentAuth, SessionGuard } from "../auth/session.guard";
import type { SessionContext } from "../auth/session.service";

@Controller("notifications")
@UseGuards(SessionGuard)
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@CurrentAuth() auth: SessionContext) {
    return this.prisma.notification.findMany({
      where: { userId: auth.user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  @Post(":id/read")
  @HttpCode(200)
  async read(@CurrentAuth() auth: SessionContext, @Param("id") id: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId: auth.user.id },
    });
    if (!notification) throw new NotFoundException({ code: "NOT_FOUND" });
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: notification.readAt ?? new Date() },
    });
  }
}
