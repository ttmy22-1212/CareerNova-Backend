import { Injectable } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

@Injectable()
export class OptionalJwtAuthGuard extends JwtAuthGuard {
  handleRequest<TUser = any>(err: any, user: any): TUser {
    if (err || !user) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return null as any;
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return user;
  }
}
