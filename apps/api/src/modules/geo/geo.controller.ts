import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsLatitude, IsLongitude, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { RequirePermission } from '../../common/decorators/auth.decorators';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorators';
import { GeoService } from './geo.service';

class LangQuery {
  @ApiPropertyOptional({ enum: ['uz', 'ru', 'en'] }) @IsOptional() @IsIn(['uz', 'ru', 'en']) lang: string = 'uz';
}

class SearchQuery extends LangQuery {
  @ApiProperty({ example: 'Chilonzor 9 kvartal' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString() @MinLength(2) @MaxLength(200) q!: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsLatitude() lat?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsLongitude() lng?: number;
}

class ReverseQuery extends LangQuery {
  @ApiProperty() @Type(() => Number) @IsLatitude() lat!: number;
  @ApiProperty() @Type(() => Number) @IsLongitude() lng!: number;
}

/** Operator klub joyini belgilashi uchun manzil qidiruvi (Yandex Geocoder proksisi). */
@ApiTags('geo')
@ApiBearerAuth()
@Controller('geo')
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  @RateLimit('public')
  @Get('search')
  @RequirePermission('operator.dashboard')
  @ApiOperation({ summary: 'Manzil/mo\'ljal qidiruvi (qisman ham), O\'zbekiston bo\'yicha' })
  search(@Query() q: SearchQuery) {
    return this.geo.search(q.q, q.lang, q.lat !== undefined && q.lng !== undefined ? { lat: q.lat, lng: q.lng } : undefined);
  }

  @RateLimit('public')
  @Get('reverse')
  @RequirePermission('operator.dashboard')
  @ApiOperation({ summary: 'Koordinata → manzil' })
  reverse(@Query() q: ReverseQuery) {
    return this.geo.reverse(q.lat, q.lng, q.lang);
  }
}
