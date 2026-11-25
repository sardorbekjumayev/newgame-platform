import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { type Actor, CurrentActor } from '../../common/decorators/actor.decorator';
import { Public, RequirePermission } from '../../common/decorators/auth.decorators';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorators';
import { CreateBackupDto } from './backups.dto';
import { BackupsService } from './backups.service';

@ApiTags('backups')
@Controller('admin/backups')
export class BackupsController {
  constructor(private readonly svc: BackupsService) {}

  @Get()
  @ApiBearerAuth()
  @RequirePermission('platform.backups.manage')
  @ApiOperation({ summary: 'Baza va fayllar hajmi, oxirgi nusxalar' })
  info() {
    return this.svc.info();
  }

  @Post()
  @ApiBearerAuth()
  @RequirePermission('platform.backups.manage')
  @RateLimit('sensitive')
  @ApiOperation({ summary: "Zaxira nusxa (zip) tayyorlash: davr berilmasa — to'liq; javobdagi `id` bilan 10 daqiqa ichida yuklab olinadi" })
  create(@Body() dto: CreateBackupDto, @CurrentActor() actor: Actor) {
    return this.svc.create(dto, actor);
  }

  /**
   * Brauzer faylni oddiy havola bilan yuklaydi (Authorization sarlavhasisiz), shuning uchun JWT o'rniga
   * `id` ning o'zi kalit: 192 bitli tasodifiy qiymat, faqat nusxani yaratgan super adminga qaytadi, 10 daqiqa yashaydi.
   */
  @Get(':id/download')
  @Public()
  @RateLimit('sensitive')
  @ApiOperation({ summary: 'Tayyor zip faylni yuklab olish' })
  async download(@Param('id') id: string, @Res() res: Response) {
    const file = await this.svc.file(id);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Length', String(file.size));
    res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
    res.setHeader('Cache-Control', 'no-store');
    createReadStream(file.path)
      .on('error', () => res.destroy())
      .pipe(res);
  }
}
