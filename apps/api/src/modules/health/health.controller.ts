import { Controller, Get } from "@nestjs/common";
import { branding } from "@careerid/branding";

@Controller("health")
export class HealthController {
  @Get()
  check(): { status: "ok"; service: string } {
    return { status: "ok", service: branding.productName };
  }
}
