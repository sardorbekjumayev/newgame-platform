import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Davr berilmasa — butun davr (to'liq nusxa). `from`/`to` faqat birga beriladi, ikkalasi ham shu kunni o'z ichiga oladi. */
export class CreateBackupDto {
  @ApiPropertyOptional({ description: 'Davr boshi, YYYY-MM-DD (APP_TIMEZONE_DEFAULT bo\'yicha kun)', example: '2026-11-01' })
  @IsOptional()
  @Matches(DATE_RE)
  from?: string;

  @ApiPropertyOptional({ description: 'Davr oxiri, YYYY-MM-DD (shu kun ham kiradi)', example: '2026-11-30' })
  @IsOptional()
  @Matches(DATE_RE)
  to?: string;
}
