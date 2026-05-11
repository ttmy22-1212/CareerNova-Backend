import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../../email/email.service';
import { RegisterDto, RegisterResponseDto } from './dto/register.dto';
import { IBaseResponse } from '../../common/interfaces/response.interface';
import { JwtPayload, IAuthResult } from './interfaces/auth.interface';
import { LoginDto, LoginResponseDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class AuthService {
  private googleClient: OAuth2Client;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private mailService: EmailService,
  ) {
    this.googleClient = new OAuth2Client(
      this.configService.get<string>('GOOGLE_CLIENT_ID'),
      this.configService.get<string>('GOOGLE_CLIENT_SECRET'),
      this.configService.get<string>('GOOGLE_REDIRECT_URI'),
    );
  }

  async register(
    dto: RegisterDto,
  ): Promise<IBaseResponse<RegisterResponseDto>> {
    const { full_name, email, password } = dto;

    // Check users.email exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      // 409
      throw new ConflictException('AUTH_EMAIL_EXISTS');
    }

    try {
      // Hash password by bcrypt
      const saltOrRounds = 10;
      const password_hash = await bcrypt.hash(password, saltOrRounds);

      const verify_token = crypto.randomBytes(32).toString('hex');
      const expires = new Date();
      expires.setHours(expires.getHours() + 24);

      const newUser = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            full_name,
            email,
            password_hash,
            role: 'student',
            is_active: false,
            verify_token,
            verify_token_expires: expires,
          },
        });

        await tx.userAuthProvider.create({
          data: {
            user_id: user.user_id,
            provider: 'local',
            provider_user_id: user.user_id,
            provider_email: email,
          },
        });

        return user;
      });

      await this.mailService.sendVerificationEmail(email, verify_token);

      return {
        message: 'REGISTER_SUCCESS_PLEASE_VERIFY_EMAIL',
        data: {
          user_id: newUser.user_id,
          email: newUser.email,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      console.error(error);
      throw new InternalServerErrorException('AUTH_REGISTER_FAILED');
    }
  }

  async verifyEmail(token: string): Promise<IBaseResponse<null>> {
    const user = await this.prisma.user.findFirst({
      where: { verify_token: token },
    });

    if (!user) {
      throw new ConflictException('AUTH_INVALID_VERIFY_TOKEN');
    }

    if (user.verify_token_expires && new Date() > user.verify_token_expires) {
      throw new ConflictException('AUTH_VERIFY_TOKEN_EXPIRED');
    }

    await this.prisma.user.update({
      where: { user_id: user.user_id },
      data: {
        is_active: true,
        verify_token: null,
        verify_token_expires: null,
      },
    });

    return {
      message: 'Xác thực tài khoản thành công',
    };
  }

  async login(dto: LoginDto): Promise<IBaseResponse<LoginResponseDto>> {
    const { email, password } = dto;

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        auth_providers: true,
      },
    });

    // Not found
    if (!user) {
      throw new NotFoundException('AUTH_ACCOUNT_NOT_FOUND');
    }

    // Check active
    if (!user.is_active) {
      throw new UnauthorizedException('AUTH_ACCOUNT_NOT_ACTIVE');
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash!);

    if (!isPasswordValid) {
      throw new UnauthorizedException('AUTH_INVALID_CREDENTIALS');
    }

    // Update last_login_at for local provider
    await this.prisma.userAuthProvider.updateMany({
      where: {
        user_id: user.user_id,
        provider: 'local',
      },
      data: {
        last_login_at: new Date(),
      },
    });

    // Generate tokens
    const tokens = await this.generateTokens(user);

    return {
      message: 'LOGIN_SUCCESS',
      data: {
        user_id: user.user_id,
        email: user.email,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      },
    };
  }

  getGoogleAuthUrl() {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const redirectUri = this.configService.get<string>('GOOGLE_REDIRECT_URI');

    const url =
      `https://accounts.google.com/o/oauth2/v2/auth` +
      `?client_id=${clientId}` +
      `&redirect_uri=${redirectUri}` +
      `&response_type=code` +
      `&scope=openid email profile` +
      `&access_type=offline` +
      `&prompt=consent`;

    return { url };
  }

  async googleLogin(code: string): Promise<IBaseResponse<any>> {
    try {
      // exchange code -> tokens
      const { tokens } = await this.googleClient.getToken(code);

      const idToken = tokens.id_token;

      if (!idToken) {
        throw new BadRequestException('AUTH_GOOGLE_NO_ID_TOKEN');
      }

      // verify id_token
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: this.configService.get<string>('GOOGLE_CLIENT_ID'),
      });

      const payload = ticket.getPayload();

      if (!payload) {
        throw new BadRequestException('AUTH_GOOGLE_INVALID_TOKEN');
      }

      // extract google user
      const provider = 'google';
      const provider_user_id = payload.sub;
      const provider_email = payload.email!;
      const full_name = payload.name;

      // check existing provider login
      const existingProvider = await this.prisma.userAuthProvider.findFirst({
        where: {
          provider,
          provider_user_id,
        },
        include: {
          user: true,
        },
      });

      let user: User;

      if (existingProvider) {
        user = existingProvider.user;
      } else {
        user = await this.prisma.$transaction(async (tx) => {
          let existingUser = await tx.user.findUnique({
            where: { email: provider_email },
          });

          if (!existingUser) {
            existingUser = await tx.user.create({
              data: {
                full_name: full_name || provider_email.split('@')[0],
                email: provider_email,
                is_active: true,
                role: 'student',
              },
            });
          }

          await tx.userAuthProvider.create({
            data: {
              user_id: existingUser.user_id,
              provider,
              provider_user_id,
              provider_email,
              last_login_at: new Date(),
            },
          });

          return existingUser;
        });
      }

      // update last login
      await this.prisma.userAuthProvider.updateMany({
        where: {
          user_id: user.user_id,
          provider,
        },
        data: {
          last_login_at: new Date(),
        },
      });

      // generate JWT
      const tokensResult = await this.generateTokens(user);

      return {
        message: 'LOGIN_SUCCESS',
        data: {
          user_id: user.user_id,
          email: user.email,
          access_token: tokensResult.access_token,
          refresh_token: tokensResult.refresh_token,
        },
      };
    } catch (error) {
      console.error(error);
      throw new InternalServerErrorException('AUTH_GOOGLE_LOGIN_FAILED');
    }
  }

  // getFacebookAuthUrl() {
  //   const appId = this.configService.get<string>('FACEBOOK_APP_ID');
  //   const redirectUri = this.configService.get<string>('FACEBOOK_REDIRECT_URI');

  //   const state = crypto.randomBytes(16).toString('hex');

  //   const url =
  //     `https://www.facebook.com/v18.0/dialog/oauth` +
  //     `?client_id=${appId}` +
  //     `&redirect_uri=${encodeURIComponent(redirectUri!)}` +
  //     `&response_type=code` +
  //     `&scope=email,public_profile` +
  //     `&state=${state}`;

  //   return {
  //     url,
  //   };
  // }

  // async facebookLogin(code: string): Promise<IBaseResponse<any>> {
  //   try {
  //     const appId = this.configService.get<string>('FACEBOOK_APP_ID');
  //     const appSecret = this.configService.get<string>('FACEBOOK_APP_SECRET');
  //     const redirectUri = this.configService.get<string>(
  //       'FACEBOOK_REDIRECT_URI',
  //     );

  //     // 1. exchange code -> access token
  //     const tokenRes = await fetch(
  //       `https://graph.facebook.com/v18.0/oauth/access_token` +
  //         `?client_id=${appId}` +
  //         `&redirect_uri=${encodeURIComponent(redirectUri!)}` +
  //         `&client_secret=${appSecret}` +
  //         `&code=${code}`,
  //     );

  //     const tokenData = await tokenRes.json();

  //     if (!tokenData.access_token) {
  //       throw new BadRequestException('AUTH_FACEBOOK_TOKEN_FAILED');
  //     }

  //     const accessToken = tokenData.access_token;

  //     // 2. get user profile
  //     const profileRes = await fetch(
  //       `https://graph.facebook.com/me?fields=id,name,email&access_token=${accessToken}`,
  //     );

  //     const profile = await profileRes.json();

  //     if (!profile.id) {
  //       throw new BadRequestException('AUTH_FACEBOOK_PROFILE_FAILED');
  //     }

  //     const facebookUser = {
  //       provider: 'facebook',
  //       provider_user_id: profile.id,
  //       provider_email: profile.email ?? `${profile.id}@facebook.com`,
  //       full_name: profile.name,
  //     };

  //     return this.socialLoginFlow(facebookUser);
  //   } catch (error) {
  //     console.error(error);
  //     throw new InternalServerErrorException('AUTH_FACEBOOK_LOGIN_FAILED');
  //   }
  // }

  private async socialLoginFlow(dto: {
    provider: string;
    provider_user_id: string;
    provider_email: string;
    full_name?: string;
  }): Promise<IBaseResponse<any>> {
    const { provider, provider_user_id, provider_email, full_name } = dto;

    const existingProvider = await this.prisma.userAuthProvider.findFirst({
      where: {
        provider,
        provider_user_id,
      },
      include: {
        user: true,
      },
    });

    let user: User;

    if (existingProvider) {
      user = existingProvider.user;
    } else {
      user = await this.prisma.$transaction(async (tx) => {
        let existingUser = await tx.user.findUnique({
          where: { email: provider_email },
        });

        if (!existingUser) {
          existingUser = await tx.user.create({
            data: {
              full_name: full_name || provider_email.split('@')[0],
              email: provider_email,
              is_active: true,
              role: 'student',
            },
          });
        }

        await tx.userAuthProvider.create({
          data: {
            user_id: existingUser.user_id,
            provider,
            provider_user_id,
            provider_email,
            last_login_at: new Date(),
          },
        });

        return existingUser;
      });
    }

    // update last login
    await this.prisma.userAuthProvider.updateMany({
      where: {
        user_id: user.user_id,
        provider,
      },
      data: {
        last_login_at: new Date(),
      },
    });

    // generate JWT
    const tokens = await this.generateTokens(user);

    return {
      message: 'LOGIN_SUCCESS',
      data: {
        user_id: user.user_id,
        email: user.email,
        ...tokens,
      },
    };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<IBaseResponse<null>> {
    const { email } = dto;

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (user) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      const expires = new Date();
      expires.setHours(expires.getHours() + 1);

      await this.prisma.user.update({
        where: { user_id: user.user_id },
        data: {
          verify_token: resetToken,
          verify_token_expires: expires,
        },
      });

      await this.mailService.sendPasswordResetEmail(email, resetToken);
    }

    return {
      message:
        'Nếu email tồn tại trong hệ thống, bạn sẽ nhận được hướng dẫn đặt lại mật khẩu.',
    };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<IBaseResponse<null>> {
    const { token, newPassword } = dto;

    const user = await this.prisma.user.findFirst({
      where: {
        verify_token: token,
        verify_token_expires: { gte: new Date() },
      },
    });

    if (!user) {
      throw new BadRequestException(
        'Mã xác nhận không hợp lệ hoặc đã hết hạn.',
      );
    }

    const saltOrRounds = 10;
    const password_hash = await bcrypt.hash(newPassword, saltOrRounds);

    await this.prisma.user.update({
      where: { user_id: user.user_id },
      data: {
        password_hash,
        verify_token: null,
        verify_token_expires: null,
      },
    });

    return {
      message: 'Mật khẩu của bạn đã được cập nhật thành công.',
    };
  }

  private async generateTokens(user: User): Promise<IAuthResult> {
    const payload: JwtPayload = {
      sub: user.user_id,
      email: user.email!,
      role: user.role,
    };

    const [access_token, refresh_token] = await Promise.all([
      this.jwtService.signAsync(payload, {
        expiresIn:
          this.configService.get<number>('JWT_ACCESS_TOKEN_EXPIRES_IN') || 900,
      }),
      this.jwtService.signAsync(payload, {
        expiresIn:
          this.configService.get<number>('JWT_REFRESH_TOKEN_EXPIRES_IN') ||
          604800,
      }),
    ]);

    return {
      user: {
        user_id: user.user_id,
        full_name: user.full_name,
        email: user.email,
        avatar_url: user.avatar_url,
        role: user.role,
      },
      access_token,
      refresh_token,
    };
  }
}
