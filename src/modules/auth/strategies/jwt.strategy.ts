import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../interfaces/auth.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(private readonly configService: ConfigService) {
    const secret = configService.get<string>('JWT_SECRET');

    if (!secret) {
      const errorMsg = 'JWT_SECRET is not defined in environment variables';
      new Logger('Config').error(errorMsg);
      throw new Error(errorMsg);
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    this.logger.debug(`Validating payload for user: ${payload.email}`);

    if (!payload.sub || !payload.email) {
      this.logger.warn(`Invalid JWT payload: ${JSON.stringify(payload)}`);
      throw new UnauthorizedException('INVALID_TOKEN_PAYLOAD');
    }
    return payload;
  }
}
