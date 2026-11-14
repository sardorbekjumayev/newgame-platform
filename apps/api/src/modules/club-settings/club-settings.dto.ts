import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimOrNull = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || null : value);
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;

export const TARIFF_TYPES = ['HOURLY', 'PACKAGE'] as const;
/** 1 000 000 000 so'm — tiyinda; xato kiritishdan himoya. */
const MAX_PRICE = 100_000_000_000;

export class CreateZoneDto {
  @ApiProperty({ example: 'VIP' }) @Transform(trim) @IsString() @MinLength(1) @MaxLength(60) name!: string;
  @ApiProperty({ example: 10, description: 'Zonadagi qurilmalar soni' }) @Type(() => Number) @IsInt() @Min(1) @Max(1000) devices_count!: number;
  @ApiPropertyOptional() @Transform(trimOrNull) @IsOptional() @IsString() @MaxLength(300) description?: string | null;
  @ApiPropertyOptional({ example: '#C6FF3D' }) @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(COLOR) color?: string | null;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1000) sort_order?: number;
}

export class UpdateZoneDto {
  @ApiPropertyOptional() @Transform(trim) @IsOptional() @IsString() @MinLength(1) @MaxLength(60) name?: string;
  @ApiPropertyOptional({ example: 10 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) devices_count?: number;
  @ApiPropertyOptional() @Transform(trimOrNull) @IsOptional() @IsString() @MaxLength(300) description?: string | null;
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(COLOR) color?: string | null;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1000) sort_order?: number;
}

/** Narx — tiyinda (1 so'm = 100). PACKAGE uchun duration_minutes majburiy. valid_from/valid_to — ikkalasi yoki hech biri. */
export class CreateTariffDto {
  @ApiProperty() @IsUUID() zone_id!: string;
  @ApiProperty({ example: 'Soatbay' }) @Transform(trim) @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @ApiProperty({ enum: TARIFF_TYPES }) @IsIn(TARIFF_TYPES) type!: 'HOURLY' | 'PACKAGE';
  @ApiProperty({ description: 'Tiyin', example: 1500000 }) @Type(() => Number) @IsInt() @Min(0) @Max(MAX_PRICE) price!: number;
  @ApiPropertyOptional({ description: 'PACKAGE: daqiqa', example: 180 })
  @ValidateIf((o) => o.type === 'PACKAGE') @Type(() => Number) @IsInt() @Min(15) @Max(24 * 60 * 7) duration_minutes?: number;
  @ApiPropertyOptional({ example: '22:00' }) @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(TIME) valid_from?: string | null;
  @ApiPropertyOptional({ example: '08:00' }) @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(TIME) valid_to?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() is_active?: boolean;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1000) sort_order?: number;
}

export class UpdateTariffDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() zone_id?: string;
  @ApiPropertyOptional() @Transform(trim) @IsOptional() @IsString() @MinLength(1) @MaxLength(80) name?: string;
  @ApiPropertyOptional({ enum: TARIFF_TYPES }) @IsOptional() @IsIn(TARIFF_TYPES) type?: 'HOURLY' | 'PACKAGE';
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(MAX_PRICE) price?: number;
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @Type(() => Number) @IsInt() @Min(15) @Max(24 * 60 * 7) duration_minutes?: number | null;
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(TIME) valid_from?: string | null;
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(TIME) valid_to?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() is_active?: boolean;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1000) sort_order?: number;
}

/** { always_open?: boolean, mon: [{open, close}] | [] , ... } — bo'sh massiv = dam olish kuni. */
export class WorkingHoursDto {
  @ApiProperty({
    example: { always_open: false, mon: [{ open: '10:00', close: '02:00' }], sun: [] },
    description: 'Kunlar: mon..sun; close <= open — keyingi kunga o\'tadi (Asia/Tashkent)',
  })
  @IsObject()
  working_hours!: Record<string, unknown>;
}
