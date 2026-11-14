import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimOrNull = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || null : value);
/** 1 000 000 000 so'm — tiyinda. */
const MAX_PRICE = 100_000_000_000;

export class CreatePlanDto {
  @ApiProperty({ example: 'Standart' }) @Transform(trim) @IsString() @MinLength(1) @MaxLength(60) name!: string;
  @ApiProperty({ description: 'Oylik narx, tiyinda', example: 10000000 }) @Type(() => Number) @IsInt() @Min(0) @Max(MAX_PRICE) price!: number;
  @ApiProperty({ example: 5 }) @Type(() => Number) @IsInt() @Min(1) @Max(100) max_zones!: number;
  @ApiProperty({ example: 50 }) @Type(() => Number) @IsInt() @Min(1) @Max(10000) max_devices!: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() is_active?: boolean;
}

export class UpdatePlanDto {
  @ApiPropertyOptional() @Transform(trim) @IsOptional() @IsString() @MinLength(1) @MaxLength(60) name?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(MAX_PRICE) price?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) max_zones?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10000) max_devices?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() is_active?: boolean;
}

/** Klubga obuna berish: reja + sinov (kun) + to'langan oylar. Amaldagi obuna almashtiriladi. */
export class AssignSubscriptionDto {
  @ApiProperty() @IsUUID() plan_id!: string;
  @ApiProperty({ example: 14, description: 'Sinov muddati, kun (0 — sinovsiz)' }) @Type(() => Number) @IsInt() @Min(0) @Max(365) trial_days!: number;
  @ApiProperty({ example: 1, description: "Sinovdan keyingi to'langan oylar (0 — faqat sinov)" }) @Type(() => Number) @IsInt() @Min(0) @Max(36) months!: number;
  @ApiPropertyOptional() @Transform(trimOrNull) @IsOptional() @IsString() @MaxLength(500) note?: string | null;
}

/** Uzaytirish (to'lov qabul qilindi): tugash sanasi (yoki bugundan, agar tugagan bo'lsa) + N oy. */
export class ExtendSubscriptionDto {
  @ApiProperty({ example: 1 }) @Type(() => Number) @IsInt() @Min(1) @Max(36) months!: number;
  @ApiPropertyOptional() @Transform(trimOrNull) @IsOptional() @IsString() @MaxLength(500) note?: string | null;
}
