import { Module } from '@nestjs/common';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        ({
          secret: configService.get<string>('JWT_SECRET')!,
          signOptions: {
            expiresIn:
              configService.get<string>('JWT_ACCESS_TOKEN_EXPIRES_IN') || '15m',
          },
        }) as JwtModuleOptions,
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
