import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { PageQuery } from '../../common/dto/pagination.dto';
import { UZ_PHONE } from '../auth/dto/auth.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimOrNull = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || undefined : value);
const lower = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

/** Login: lotin harf, raqam, nuqta, _ va -; 3–32 belgi; harf bilan boshlanadi. */
export const USERNAME = /^[a-z][a-z0-9._-]{2,31}$/;
const usernameMsg = { message: 'username: 3-32 belgi, lotin harf bilan boshlanadi (a-z, 0-9, . _ -)' };

export const CLUB_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;
export const USER_STATUSES = ['ACTIVE', 'BLOCKED'] as const;

/** Klub (filial) + uning operator akkaunti — bitta amal. Parol berilmasa vaqtinchalik parol yaratiladi. */
export class CreateClubDto {
  @ApiProperty({ example: 'Cyber Arena — Chilonzor' }) @Transform(trim) @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @ApiProperty({ example: 'Toshkent' }) @Transform(trim) @IsString() @MinLength(2) @MaxLength(80) city!: string;
  @ApiPropertyOptional() @Transform(trimOrNull) @IsOptional() @IsString() @MaxLength(300) address?: string;
  @ApiPropertyOptional({ example: '+998901234567' }) @Transform(trimOrNull) @IsOptional() @Matches(UZ_PHONE) phone?: string;
  @ApiPropertyOptional({ description: 'Qaysi arizadan (ariza APPROVED bo\'ladi)' }) @IsOptional() @IsUUID() application_id?: string;

  @ApiProperty({ example: 'cyberarena.chilonzor' }) @Transform(lower) @Matches(USERNAME, usernameMsg) operator_username!: string;
  @ApiProperty({ example: 'Aziz' }) @Transform(trim) @IsString() @MinLength(1) @MaxLength(80) operator_first_name!: string;
  @ApiPropertyOptional() @Transform(trimOrNull) @IsOptional() @IsString() @MaxLength(80) operator_last_name?: string;
  @ApiPropertyOptional({ description: 'Bo\'sh — vaqtinchalik parol yaratiladi (birinchi kirishda almashtiriladi)' })
  @Transform(trimOrNull) @IsOptional() @IsString() @MinLength(8) @MaxLength(128) operator_password?: string;
}

export class UpdateClubDto {
  @ApiPropertyOptional() @Transform(trim) @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @ApiPropertyOptional() @Transform(trim) @IsOptional() @IsString() @MinLength(2) @MaxLength(80) city?: string;
  @ApiPropertyOptional() @Transform(trim) @IsOptional() @IsString() @MaxLength(300) address?: string;
  @ApiPropertyOptional() @Transform(trimOrNull) @IsOptional() @Matches(UZ_PHONE) phone?: string;
  @ApiPropertyOptional({ enum: CLUB_STATUSES }) @IsOptional() @IsIn(CLUB_STATUSES) status?: string;
}

export class CreateManagerDto {
  @ApiProperty({ example: 'jasur.manager' }) @Transform(lower) @Matches(USERNAME, usernameMsg) username!: string;
  @ApiProperty({ example: 'Jasur' }) @Transform(trim) @IsString() @MinLength(1) @MaxLength(80) first_name!: string;
  @ApiPropertyOptional() @Transform(trimOrNull) @IsOptional() @IsString() @MaxLength(80) last_name?: string;
  @ApiPropertyOptional({ example: '+998901234567' }) @Transform(trimOrNull) @IsOptional() @Matches(UZ_PHONE) phone?: string;
  @ApiPropertyOptional({ description: 'Bo\'sh — vaqtinchalik parol yaratiladi' })
  @Transform(trimOrNull) @IsOptional() @IsString() @MinLength(8) @MaxLength(128) password?: string;
}

export class UserStatusDto {
  @ApiProperty({ enum: USER_STATUSES }) @IsIn(USER_STATUSES) status!: string;
}

export class ListQuery extends PageQuery {}

/** Bir martalik javob: login + parol (faqat shu javobda; DB'da faqat hash). */
export class CredentialsResponse {
  @ApiProperty() user_id!: string;
  @ApiProperty() public_id!: string;
  @ApiProperty() username!: string;
  @ApiPropertyOptional({ description: 'Faqat vaqtinchalik parol yaratilganda' }) password?: string;
  @ApiProperty() must_change_password!: boolean;
}

export const UNLINK_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;

export class RemovalListQuery extends PageQuery {
  @ApiPropertyOptional({ enum: UNLINK_STATUSES }) @IsOptional() @IsIn(UNLINK_STATUSES) status?: string;
}

export class RemovalDecisionDto {
  @ApiPropertyOptional({ description: 'Super admin izohi (operator va menejer bilan gaplashuv natijasi)' })
  @Transform(trimOrNull) @IsOptional() @IsString() @MaxLength(2000) admin_note?: string;
}
