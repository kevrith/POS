import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(private webhooksService: WebhooksService) {}

  @Get()
  list(@Query('businessId') businessId: string) {
    return this.webhooksService.list(businessId);
  }

  @Post()
  create(@Body() body: { businessId: string; url: string; secret?: string; events: string[]; description?: string }) {
    return this.webhooksService.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: { url?: string; secret?: string; events?: string[]; description?: string; isActive?: boolean }) {
    return this.webhooksService.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.webhooksService.remove(id);
  }

  @Post(':id/ping')
  ping(@Param('id') id: string) {
    return this.webhooksService.ping(id);
  }
}
