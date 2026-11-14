import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';

/** Super admin: klub (filial) + operator, menejer akkauntlari. */
@Module({ controllers: [AccountsController], providers: [AccountsService] })
export class AccountsModule {}
