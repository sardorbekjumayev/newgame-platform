import { Controller, Get, Param, ParseUUIDPipe, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { stat } from 'node:fs/promises';
import { Public } from '../../common/decorators/auth.decorators';
import { AppException } from '../../common/errors';
import { NoRateLimit } from '../../common/rate-limit/rate-limit.decorators';
import { CLUB_FILE_RE, MediaService } from './media.service';

/**
 * Ommaviy fayllar (klub logotipi va rasmi). Statik fayl — nginx'dagidek cheklanmaydi:
 * xaritada ko'p klub bo'lsa ham rasmlar 429 olmasin; nom o'zgarmas, brauzer muddatsiz keshlaydi.
 */
@ApiTags('media')
@Public()
@NoRateLimit()
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Get('clubs/:clubId/:file')
  @ApiOperation({ summary: 'Klub logotipi yoki rasmi (webp)' })
  async club(@Param('clubId', new ParseUUIDPipe()) clubId: string, @Param('file') file: string, @Res() res: Response) {
    const abs = CLUB_FILE_RE.test(file) ? this.media.resolve(`clubs/${clubId}/${file}`) : null;
    const st = abs ? await stat(abs).catch(() => null) : null;
    if (!abs || !st?.isFile()) throw new AppException('NOT_FOUND', 'File not found');
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    // helmet standarti same-origin; ommaviy rasm boshqa domendan ham <img> bilan ochilishi mumkin
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.sendFile(abs, (err) => {
      if (err && !res.headersSent) res.status(404).end();
    });
  }
}
