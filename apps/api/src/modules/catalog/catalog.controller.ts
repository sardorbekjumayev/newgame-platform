import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { Public } from '../../common/decorators/auth.decorators';
import { AppException } from '../../common/errors';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorators';
import { CatalogService } from './catalog.service';

const NUM = '-?\\d{1,3}(?:\\.\\d+)?';
class MapQuery {
  @ApiPropertyOptional({ description: "w,s,e,n (lng,lat,lng,lat). Bo'lmasa — barcha klublar", example: '69.1,41.2,69.4,41.4' })
  @IsOptional()
  @Matches(new RegExp(`^${NUM},${NUM},${NUM},${NUM}$`))
  bbox?: string;
}
class LatestQuery {
  @ApiPropertyOptional({ default: 6 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(24) limit = 6;
}

@ApiTags('catalog')
@Public()
@RateLimit('public')
@Controller('clubs')
export class CatalogController {
  constructor(private readonly svc: CatalogService) {}

  @Get('map')
  @ApiOperation({ summary: 'Xarita: faol va joyi belgilangan klublar (bbox ichida), eng arzon narx, hozir ochiqmi' })
  map(@Query() q: MapQuery) {
    const bbox = q.bbox ? (q.bbox.split(',').map(Number) as [number, number, number, number]) : null;
    if (bbox && (bbox[0] > bbox[2] || bbox[1] > bbox[3])) throw new AppException('VALIDATION_ERROR', 'Invalid bbox', { field: 'bbox' });
    return this.svc.map(bbox);
  }

  @Get('latest')
  @ApiOperation({ summary: 'Landing: yangi qo\'shilgan klublar' })
  latest(@Query() q: LatestQuery) {
    return this.svc.latest(q.limit);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Landing: klublar soni, hozir ochiqlari, shaharlar' })
  stats() {
    return this.svc.stats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Klub sahifasi: zonalar, tariflar, ish vaqti' })
  club(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.club(id);
  }
}
