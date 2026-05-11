import {
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import { JwtPayload } from '../interfaces/auth.interface';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    this.logger.debug(`Guard checking access for: ${request.url}`);

    return super.canActivate(context);
  }

  handleRequest<TUser = JwtPayload>(
    err: Error | null,
    user: TUser | false,
    info: Error | null,
  ): TUser {
    if (err || !user) {
      if (info) {
        this.logger.warn(`JWT Authentication failed: ${info.message}`);
      }

      if (err) {
        this.logger.error(`Auth Error: ${err.message}`);
      }

      throw (
        err ||
        new UnauthorizedException(
          info?.message === 'jwt expired'
            ? 'AUTH_TOKEN_EXPIRED'
            : 'UNAUTHORIZED_ACCESS',
        )
      );
    }

    return user;
  }
}
